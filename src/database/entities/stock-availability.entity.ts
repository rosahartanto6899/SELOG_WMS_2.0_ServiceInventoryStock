import { DataTypes, ModelDefined, Optional } from 'sequelize';
import { sequelize } from '@/utils/database.util';
import { StockAvailabilityAttributes } from '@/database/attributes';

type Creation = Optional<StockAvailabilityAttributes, 'id'>;

const tableName = 'StockAvailability';

/** Stok per customer+warehouse+material — tabel existing
 *  (paritas skema live wms-inventorystock-dev, Id varchar IDENTITY-like). */
const StockAvailability: ModelDefined<
  StockAvailabilityAttributes,
  Creation
> = sequelize.define(
  tableName,
  {
    id: {
      type: DataTypes.STRING(50),
      primaryKey: true,
    },
    customerCode: { type: DataTypes.STRING(50), allowNull: true },
    customerName: { type: DataTypes.STRING(75), allowNull: true },
    warehouseCode: { type: DataTypes.STRING(50), allowNull: true },
    warehouseName: { type: DataTypes.STRING(75), allowNull: true },
    materialCode: { type: DataTypes.STRING(100), allowNull: true },
    materialName: { type: DataTypes.STRING(200), allowNull: true },
    materialBrand: { type: DataTypes.STRING(100), allowNull: true },
    uom: { type: DataTypes.STRING(20), allowNull: true },
    qtyPlanIncoming: { type: DataTypes.INTEGER, allowNull: true },
    qtyPlanOutgoing: { type: DataTypes.INTEGER, allowNull: true },
    qtySOH: { type: DataTypes.INTEGER, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: true },
    createdDate: { type: DataTypes.DATE, allowNull: true },
    createdBy: { type: DataTypes.STRING(100), allowNull: true },
    modifiedDate: { type: DataTypes.DATE, allowNull: true },
    modifiedBy: { type: DataTypes.STRING(100), allowNull: true },
    deletedDate: { type: DataTypes.DATE, allowNull: true },
    deletedBy: { type: DataTypes.STRING(100), allowNull: true },
  },
  {
    tableName,
    timestamps: false,
    indexes: [
      {
        name: 'idx_stock_availability_customer_warehouse',
        fields: ['customerCode', 'warehouseCode'],
      },
      {
        name: 'idx_stock_availability_material_code',
        fields: ['materialCode'],
      },
    ],
  },
);

export { StockAvailability };
