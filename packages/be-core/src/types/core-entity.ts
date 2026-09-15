import { Model, DataTypes, InitOptions, Sequelize, ModelAttributes } from 'sequelize';

export class CoreEntity extends Model {
  public id!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  static initModel(
    sequelize: Sequelize,
    attributes: ModelAttributes,
    options?: Omit<InitOptions, 'sequelize'>
  ) {
    return this.init(
      {
        id: {
          type: DataTypes.STRING,
          allowNull: false,
          primaryKey: true,
        },
        ...attributes,
      },
      {
        sequelize,
        timestamps: true,
        ...options,
      }
    );
  }
}
