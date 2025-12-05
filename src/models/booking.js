"use strict";
const { Model } = require("sequelize");
const { Enum } = require("../utils/common");
const { INITIATED, CANCELLED, PENDING, BOOKED } = Enum.BOOKING_STATUS;
module.exports = (sequelize, DataTypes) => {
  class Booking extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  Booking.init(
    {
      flightId: { type: DataTypes.INTEGER, allowNull: false },
      userId: { type: DataTypes.INTEGER, allowNull: false },
      status: {
        defaultValue: INITIATED,
        type: DataTypes.ENUM,
        values: [INITIATED, CANCELLED, PENDING, BOOKED],
        allowNull: false,
      },
      noOfSeats: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      totalCost: { type: DataTypes.INTEGER, allowNull: false },
    },
    {
      sequelize,
      modelName: "Booking",
    }
  );
  return Booking;
};
