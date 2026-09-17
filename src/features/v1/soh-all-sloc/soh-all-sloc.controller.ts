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
import { sohAllSlocConstant as cst } from './constants';
import { ListDto } from './dtos';

const READ = { menuCode: cst.menuCode, action: 'READ' };

/**
 * @swagger
 * tags:
 *   - name: SohAllSloc
 *     description: Report SOH All SLOC (parity CoreApp Report/SOHAllSLOCReport)
 */
@controller('/v1/soh-all-sloc')
export class SohAllSlocController extends BaseHttpController {
  private static readonly sohLogging = ControllerLogging.forEntity(
    'soh-all-sloc',
    MICROSERVICE_IDENTIFIERS.SERVICE_INVENTORY_STOCK,
  );

  constructor(
    @inject(QueryService) private readonly queryService: QueryService,
  ) {
    super();
  }

  /**
   * @swagger
   * /v1/soh-all-sloc:
   *   get:
   *     summary: SOH per material dipivot per warehouse user (satu request; parity agregasi legacy)
   *     tags: [SohAllSloc]
   *     security: [{ bearerAuth: [] }, { api_key: [] }]
   *     parameters:
   *       - { in: query, name: page, schema: { type: integer, minimum: 1 } }
   *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100 } }
   *       - { in: query, name: search, schema: { type: string } }
   *       - { in: query, name: searchBy, schema: { type: string, enum: [materialCode, materialName, materialBrand] } }
   *       - { in: query, name: order, schema: { type: string, enum: [materialCode, materialName, materialBrand, totalQty] } }
   *       - { in: query, name: sort, schema: { type: string, enum: [asc, desc] } }
   *     responses:
   *       200: { description: "{ data: { warehouses: [kode kolom dinamis], rows }, pagination }" }
   *       401: { description: Unauthorized }
   *       422: { description: Validation errors }
   */
  @ValidatePermissions(READ)
  @httpGet('/', QueryValidation(ListDto), SohAllSlocController.sohLogging.list)
  async getAll(@request() req: Request) {
    return await this.queryService.getAll(req);
  }
}
