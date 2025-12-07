const { StatusCodes } = require("http-status-codes");
const CrudRepository = require("./crud-repository");
const { Booking } = require("../models");
const { Op } = require("sequelize");
const { Enum } = require("../utils/common");
const { BOOKED, CANCELLED } = Enum.BOOKING_STATUS;
class BookingRepository extends CrudRepository {
  constructor() {
    super(Booking);
  }

  createBooking(data, transaction) {
    return Booking.create(data, { transaction });
  }

  async get(data, transaction) {
    const result = await this.model.findByPk(data, { transaction });
    if (!result) {
      throw new AppError(
        "Not able to find the resource",
        StatusCodes.NOT_FOUND
      );
    }
    return result;
  }

  async update(data, id, transaction) {
    const result = await this.model.update(
      data,
      {
        where: { id: id },
      },
      { transaction }
    );

    if (!result) {
      throw new AppError(
        "Not able to find the resource",
        StatusCodes.NOT_FOUND
      );
    }
    return result;
  }

  async cancelOldBookings(timestamp) {
    const response = await this.model.update(
      { status: CANCELLED },
      {
        where: {
          [Op.and]: [
            {
              createdAt: {
                [Op.lt]: timestamp,
              },
            },
            {
              status: {
                [Op.ne]: BOOKED,
              },
            },
            {
              status: {
                [Op.ne]: CANCELLED,
              },
            },
          ],
        },
      }
    );
    return response;
  }
}
module.exports = BookingRepository;
