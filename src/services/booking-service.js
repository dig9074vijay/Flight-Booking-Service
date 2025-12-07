const { StatusCodes } = require("http-status-codes");
const axios = require("axios");
const { BookingRepository } = require("../repositories");
const AppError = require("../utils/errors/app-error");
const bookingRepository = new BookingRepository();
const db = require("../models");
const { Enum } = require("../utils/common");
const { BOOKED, CANCELLED } = Enum.BOOKING_STATUS;

async function createBooking(data) {
  const transaction = await db.sequelize.transaction();
  try {
    const flight = await axios.get(
      `${process.env.FLIGHT_SERVICE_URL}/api/v1/flights/${data.flightId}`
    );
    const flightData = flight.data.data;
    console.log("Flight Data:", flightData);
    if (data.noOfSeats > flightData.totalSeats) {
      throw new AppError("Not enough seats available", StatusCodes.BAD_REQUEST);
    }
    const totalCost = data.noOfSeats * flightData.price;
    const bookingPayload = {
      ...data,
      totalCost,
    };
    const booking = await bookingRepository.createBooking(
      bookingPayload,
      transaction
    );

    const response = await axios.patch(
      `${process.env.FLIGHT_SERVICE_URL}/api/v1/flights/${data.flightId}/seats`,
      {
        seats: data.noOfSeats,
        dec: 1,
      }
    );
    await transaction.commit();
    return booking;
  } catch (error) {
    console.log("Error in booking service:", error);
    await transaction.rollback();

    throw new AppError(
      "Cannot create a new booking object",
      StatusCodes.INTERNAL_SERVER_ERROR
    );
  }
}

async function makePayment(data) {
  // Placeholder for payment processing logic
  const transaction = await db.sequelize.transaction();
  try {
    const booking = await bookingRepository.get(data.bookingId, transaction);
    const bookingTime = new Date(booking.createdAt);
    const currentTime = new Date();
    const diffInMinutes = Math.floor((currentTime - bookingTime) / (1000 * 60));
    if (booking.status === CANCELLED) {
      throw new AppError(
        "Booking payment time expired",
        StatusCodes.BAD_REQUEST
      );
    }
    if (diffInMinutes > 15) {
      await bookingRepository.update(
        { status: CANCELLED },
        data.bookingId,
        transaction
      );
      throw new AppError(
        "Booking payment time expired",
        StatusCodes.BAD_REQUEST
      );
    }
    if (booking.totalCost != data.totalCost) {
      throw new AppError("Payment amount mismatch", StatusCodes.BAD_REQUEST);
    }
    if (booking.userId != data.userId) {
      throw new AppError("User ID mismatch", StatusCodes.BAD_REQUEST);
    }
    const response = await bookingRepository.update(
      { status: BOOKED },
      data.bookingId,
      transaction
    );
    await transaction.commit();
  } catch (error) {
    console.log("Error in payment processing:", error);
    await transaction.rollback();
    throw error;
  }
}

module.exports = {
  createBooking,
  makePayment,
};
