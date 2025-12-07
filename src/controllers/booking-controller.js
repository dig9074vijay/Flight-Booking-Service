const { BookingService } = require("../services");
const { StatusCodes } = require("http-status-codes");
const { successResponse, errorResponse } = require("../utils/common");
const AppError = require("../utils/errors/app-error");
const inMemoryCache = {};
/**
 * Booking Controller
 * Handles requests related to bookings
 * POST /bookings
 * request body: { flightId, userId, seatNumber }
 */

async function createBooking(req, res) {
  try {
    const bookingData = req.body;
    const booking = await BookingService.createBooking({
      flightId: bookingData.flightId,
      userId: bookingData.userId,
      noOfSeats: bookingData.noOfSeats,
    });
    successResponse.message = "Booking created successfully";
    successResponse.data = booking;
    res.status(StatusCodes.CREATED).json(successResponse);
  } catch (error) {
    errorResponse.message = "Failed to create booking";
    errorResponse.error = error;
    res.status(error.statusCode).json(errorResponse);
  }
}

async function makePayment(req, res) {
  try {
    const idempotencyKey = req.headers["x-idempotency-key"];
    // Use the idempotencyKey to ensure idempotent payment processing
    if (!idempotencyKey) {
      throw new AppError(
        "Idempotency key is required",
        StatusCodes.BAD_REQUEST
      );
    }
    if (inMemoryCache["x-idempotency-key"] === idempotencyKey) {
      successResponse.message = "Payment already processed";
      successResponse.data = inMemoryCache[idempotencyKey];
      return res.status(StatusCodes.OK).json(successResponse);
    }
    const paymentData = req.body;
    const booking = await BookingService.makePayment({
      totalCost: paymentData.totalCost,
      userId: paymentData.userId,
      bookingId: paymentData.bookingId,
    });
    successResponse.message = "Payment made successfully";
    successResponse.data = booking;
    inMemoryCache["x-idempotency-key"] = idempotencyKey;
    res.status(StatusCodes.CREATED).json(successResponse);
  } catch (error) {
    errorResponse.message = "Failed to pay for the booking";
    errorResponse.error = error;
    res.status(error.statusCode).json(errorResponse);
  }
}

module.exports = {
  createBooking,
  makePayment,
};
