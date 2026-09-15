import { DataTypes, ModelDefined, Optional } from 'sequelize';
import { sequelize } from '@/utils/database.util';
import { StockAvailabilityLogAttributes } from '@/database/attributes';

type Creation = Optional<StockAvailabilityLogAttributes, 'id'>;

const tableName = 'StockAvailabilityLog';

/** Log mutasi stok per material — tabel existing, dibaca
 *  usp_GetHistoryStockOnHand (dashboard Stock Availability, tab History). */
const StockAvailabilityLog: ModelDefined<
  StockAvailabilityLogAttributes,
  Creation
> = sequelize.define(
  tableName,
  {
    id: { type: DataTypes.STRING(50), primaryKey: true },
    customerCode: { type: DataTypes.STRING(50), allowNull: true },
    customerName: { type: DataTypes.STRING(75), allowNull: true },
    warehouseCode: { type: DataTypes.STRING(50), allowNull: true },
    warehouseName: { type: DataTypes.STRING(75), allowNull: true },
    deliveryNoteNo: { type: DataTypes.STRING(100), allowNull: true },
    transactionType: { type: DataTypes.STRING(50), allowNull: true },
    poDate: { type: DataTypes.DATE, allowNull: true },
    materialCode: { type: DataTypes.STRING(100), allowNull: true },
    materialName: { type: DataTypes.STRING(200), allowNull: true },
    materialBrand: { type: DataTypes.STRING(100), allowNull: true },
    uom: { type: DataTypes.STRING(20), allowNull: true },
    qtySOHBefore: { type: DataTypes.INTEGER, allowNull: true },
    qtySOHAfter: { type: DataTypes.INTEGER, allowNull: true },
    description: { type: DataTypes.STRING(500), allowNull: true },
    createdDate: { type: DataTypes.DATE, allowNull: true },
    createdBy: { type: DataTypes.STRING(100), allowNull: true },
  },
  {
    tableName,
    timestamps: false,
    indexes: [
      {
        name: 'idx_stock_availability_log_material',
        fields: ['customerCode', 'warehouseCode', 'materialCode'],
      },
    ],
  },
);

export { StockAvailabilityLog };
