import { inject, injectable } from 'inversify';
import { Request } from 'express';
import { Transaction } from 'sequelize';
import { HTTP_STATUS } from '@/shared-libs/constants/http-status.constant';
import { IDataUser } from '@/shared-libs/interfaces/user-data.interface';
import { UnprocessableEntityException } from '@/shared-libs/exceptions';
import { UniqueIdGenerator } from '@/shared-libs/utils/unique-id-generator.util';
import { MasterDataService } from '@/integrations/api/master-data-service.api';
import { nowWib, sequelize } from '@/utils';
import { uploadStockAdjustmentConstant as cst } from './constants/upload-stock-adjustment.constant';
import { StockAdjustmentRepository } from './repositories';
import { UpsertDto } from './dtos';

/**
 * Adjust satu baris stok (pola upsertBulk upload-incoming-ahm) — pengganti SP
 * usp_InsertStockAdjustmentByFileName (definisi live diverifikasi dari
 * wms-inventorystock-dev). Parity SP:
 * - Material wajib ada — lookup via integration outbound ke
 *   ServiceMasterData (/v1/materials/internal/by-code, basic auth); Name/Brand/UoM
 *   stock & log diambil dari MASTER, bukan dari excel.
 * - Update stock hanya menyentuh QtySOH + modified* (MERGE lama).
 * - Log: DeliveryNoteNo '-', Description NULL, QtySOHBefore COALESCE(0).
 * Natural key stock: customerCode + warehouseCode + materialCode (token
 * session), dilindungi UQ_StockAvailability_Customer_Warehouse_Material.
 */
@injectable()
export class UploadStockAdjustmentCommandService {
  constructor(
    @inject(StockAdjustmentRepository)
    private readonly repository: StockAdjustmentRepository,
    @inject(MasterDataService)
    private readonly masterDataService: MasterDataService,
  ) {}

  async upsertBulk(req: Request): Promise<{ data: null; httpCode: number }> {
    const body = req.body as UpsertDto;
    const userData = req.user as unknown as IDataUser;
    const userBy = userData?.tokenUserId ?? 'system';
    let isCreate = true;

    // customer + warehouse aktif dari token (parity AHM) — bukan payload FE
    const customerCode = userData?.tokenCustomerCode ?? null;
    const customerName = userData?.tokenCustomerName ?? '-';
    const warehouseCode = userData?.tokenWarehouseCode ?? null;
    const warehouseName = userData?.tokenWarehouseName ?? null;
    if (!warehouseCode || !warehouseName) {
      throw new UnprocessableEntityException([
        {
          field: cst.key.warehouseCode,
          message: ['No active warehouse for this session'],
        },
      ]);
    }

    await sequelize.transaction(async (transaction: Transaction) => {
      // === Validasi master material — outbound ke ServiceMasterData
      // (basic auth), parity INNER JOIN MstMaterialTemp SP lama ===
      const material = await this.masterDataService.getMaterialByCode(
        body.materialCode,
        customerCode,
      );

      if (!material) {
        throw new UnprocessableEntityException([
          {
            field: cst.key.materialCode,
            message: [cst.messages.materialNotExist],
          },
        ]);
      }
      const mName = material.name;
      const mBrand = material.brand;
      const mUom = material.uoM;

      const existingStock = await this.repository.getStock(
        customerCode as string,
        warehouseCode,
        body.materialCode,
        transaction,
        true,
      );

      const qtyBefore = Number(existingStock?.get('qtySOH') ?? 0);

      if (existingStock) {
        isCreate = false;
        // parity MERGE: hanya QtySOH + modified* — MaterialName/Brand/UoM
        // row existing tidak ditimpa dari excel.
        await this.repository.updateStock(
          existingStock.get('id') as string,
          {
            qtySOH: body.qty,
            modifiedBy: userBy, modifiedDate: nowWib(),
          },
          transaction,
        );
      } else {
        await this.repository.createStock(
          {
            id: UniqueIdGenerator.generate(),
            customerCode,
            customerName,
            warehouseCode,
            warehouseName,
            materialCode: body.materialCode,
            materialName: mName,
            materialBrand: mBrand,
            uom: mUom,
            qtyPlanIncoming: 0,
            qtyPlanOutgoing: 0,
            qtySOH: body.qty,
            isActive: cst.isActive,
            createdBy: userBy, createdDate: nowWib(),
            modifiedDate: null, modifiedBy: null,
            deletedDate: null, deletedBy: null,
          },
          transaction,
        );
      }

      // === Log mutasi SOH — parity INSERT StockAvailabilityLog SP ===
      await this.repository.createLog(
        {
          id: UniqueIdGenerator.generate(),
          customerCode,
          customerName,
          warehouseCode,
          warehouseName,
          deliveryNoteNo: cst.logDeliveryNoteNo,
          transactionType: cst.transactionType,
          poDate: null,
          materialCode: body.materialCode,
          materialName: mName,
          materialBrand: mBrand,
          uom: mUom,
          qtySOHBefore: qtyBefore,
          qtySOHAfter: body.qty,
          description: null,
          createdBy: userBy, createdDate: nowWib(),
        },
        transaction,
      );
    });

    return {
      data: null,
      httpCode: isCreate ? HTTP_STATUS.CREATED : HTTP_STATUS.OK,
    };
  }
}
