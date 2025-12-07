const { StatusCodes } = require("http-status-codes");
const CrudRepository = require("./crud-repository");
const { Booking } = require("../models");
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
}
module.exports = BookingRepository;
