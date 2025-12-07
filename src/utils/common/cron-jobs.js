const cron = require("node-cron");
const { BookingService } = require("../../services");

function scheduleCronJobs() {
  cron.schedule("*/10 * * * * *", async () => {
    console.log("Cron job to cancel unpaid bookings triggered");
    const response = await BookingService.cancelOldBookings();
    console.log("Cancelled bookings:", response);
    // try {
    //   console.log("Running cron job to cancel unpaid bookings...");
    //   await bookingService.cancelBooking();
    //   console.log("Cron job completed successfully.");
    // } catch (error) {
    //   console.error("Error occurred during cron job:", error);
    // }
  });
}

module.exports = scheduleCronJobs;
