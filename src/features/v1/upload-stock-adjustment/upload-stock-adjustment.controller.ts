import { Request, Response } from 'express';
import { inject } from 'inversify';
import {
  BaseHttpController,
  controller,
  httpGet,
  httpPut,
  request,
} from 'inversify-express-utils';
import { BodyValidation } from '@/shared-libs/base';
import {
  ControllerLogging,
  MICROSERVICE_IDENTIFIERS,
  ValidatePermissions,
} from '@/shared-libs';
import { UpsertDto } from './dtos';
import { UploadStockAdjustmentCommandService } from './upload-stock-adjustment.command.service';
import { ExcelTemplateService } from './excel-template.service';
import { uploadStockAdjustmentConstant as cst } from './constants/upload-stock-adjustment.constant';

/**
 * @swagger
 * tags:
 *   - name: Upload Stock Adjustment
 *     description: Bulk upload stock adjustment via Excel template (parity CoreApp UploadStockAdjustment)
 */
@controller('/v1/upload-stock-adjustment')
export class UploadStockAdjustmentController extends BaseHttpController {
  private static readonly usaLogging = ControllerLogging.forEntity(
    'upload-stock-adjustment',
    MICROSERVICE_IDENTIFIERS.SERVICE_ORDER,
  );

  constructor(
    @inject(UploadStockAdjustmentCommandService)
    private readonly commandService: UploadStockAdjustmentCommandService,
    @inject(ExcelTemplateService)
    private readonly excelTemplateService: ExcelTemplateService,
  ) {
    super();
  }

  /**
   * @swagger
   * /v1/upload-stock-adjustment/template:
   *   get:
   *     summary: Download Upload Stock Adjustment template (Excel)
   *     tags: [Upload Stock Adjustment]
   *     security:
   *       - bearerAuth: []
   *       - api_key: []
   *     responses:
   *       200:
   *         description: Excel template with Ref_bodyKey integrity sheet
   *         content:
   *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
   *             schema:
   *               type: string
   *               format: binary
   *       401:
   *         description: Unauthorized
   */
  @ValidatePermissions({
    allowedMenuPermissions: [{ menuCode: cst.menuCode, action: 'READ' }],
  })
  @httpGet(
    '/template',
    UploadStockAdjustmentController.usaLogging.custom('download-template'),
  )
  async getTemplate(req: Request, res: Response) {
    return await this.excelTemplateService.generateTemplate(req, res);
  }

  /**
   * @swagger
   * /v1/upload-stock-adjustment/bulk:
   *   put:
   *     summary: Adjust satu baris stok (set qtySOH + log mutasi; stock find-or-create by customer+warehouse+material)
   *     tags: [Upload Stock Adjustment]
   *     security:
   *       - bearerAuth: []
   *       - api_key: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/UpsertUploadStockAdjustmentDto'
   *     responses:
   *       200:
   *         description: Stock row updated
   *       201:
   *         description: Stock row created
   *       422:
   *         description: Validation errors [{field, message[]}]
   */
  @ValidatePermissions({
    allowedMenuPermissions: [
      { menuCode: cst.menuCode, action: 'CREATE' },
      { menuCode: cst.menuCode, action: 'UPDATE' },
    ],
  })
  @httpPut(
    '/bulk',
    BodyValidation(UpsertDto),
    UploadStockAdjustmentController.usaLogging.bulk,
  )
  async upsertBulk(@request() req: Request) {
    return await this.commandService.upsertBulk(req);
  }
}
