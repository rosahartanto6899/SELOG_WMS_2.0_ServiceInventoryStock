import { Request } from 'express';
import { inject } from 'inversify';
import {
  BaseHttpController,
  controller,
  httpGet,
  request,
} from 'inversify-express-utils';
import {
  ControllerLogging,
  MICROSERVICE_IDENTIFIERS,
  QueryValidation,
  ValidatePermissions,
} from '@/shared-libs';
import { QueryService } from './query.service';
import { stockAvailabilityConstant as cst } from './constants';
import { ListDto, HistoryQueryDto } from './dtos';

const READ = { menuCode: cst.menuCode, action: 'READ' };

/**
 * @swagger
 * tags:
 *   - name: StockAvailability
 *     description: Dashboard stock availability (parity CoreApp StockAvailabilityDashboard)
 */
@controller('/v1/stock-availability')
export class StockAvailabilityController extends BaseHttpController {
  private static readonly saLogging = ControllerLogging.forEntity(
    'stock-availability',
    MICROSERVICE_IDENTIFIERS.SERVICE_INVENTORY_STOCK,
  );

  constructor(
    @inject(QueryService) private readonly queryService: QueryService,
  ) {
    super();
  }

  /**
   * @swagger
   * /v1/stock-availability:
   *   get:
   *     summary: Q1 — List stock per material (paging, search LIKE, sort; parity usp_ListStockAvailability)
   *     tags: [StockAvailability]
   *     security: [{ bearerAuth: [] }, { api_key: [] }]
   *     parameters:
   *       - { in: query, name: page, schema: { type: integer, minimum: 1 } }
   *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100 } }
   *       - { in: query, name: search, schema: { type: string } }
   *       - { in: query, name: searchBy, schema: { type: string, enum: [materialCode, materialName, materialBrand, customerName, warehouseName] } }
   *       - { in: query, name: order, schema: { type: string } }
   *       - { in: query, name: sort, schema: { type: string, enum: [asc, desc] } }
   *     responses:
   *       200: { description: List stock availability }
   *       401: { description: Unauthorized }
   *       422: { description: Validation errors }
   */
  @ValidatePermissions(READ)
  @httpGet(
    '/',
    QueryValidation(ListDto),
    StockAvailabilityController.saLogging.list,
  )
  async getAll(@request() req: Request) {
    return await this.queryService.getAll(req);
  }

  /**
   * @swagger
   * /v1/stock-availability/history:
   *   get:
   *     summary: Q2 — Riwayat mutasi stock on hand satu material (parity usp_GetHistoryStockOnHand)
   *     tags: [StockAvailability]
   *     security: [{ bearerAuth: [] }, { api_key: [] }]
   *     parameters:
   *       - { in: query, name: materialCode, required: true, schema: { type: string } }
   *     responses:
   *       200: { description: History rows }
   *       422: { description: Validation errors }
   */
  @ValidatePermissions(READ)
  @httpGet(
    '/history',
    QueryValidation(HistoryQueryDto),
    StockAvailabilityController.saLogging.view,
  )
  async getHistory(@request() req: Request) {
    return await this.queryService.getHistory(req);
  }
}
