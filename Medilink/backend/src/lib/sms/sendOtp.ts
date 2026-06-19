// export async function sendOtpSms(phone: string, code: string): Promise<void> {
//   if (!process.env.TWILIO_ENABLED) {
//     console.log(`[DEV] OTP for ${phone}: ${code}`);
//     return;
//   }

//   // TODO: rate limit — enforce per-phone cooldown before calling Twilio
//   const twilio = require("twilio")(
//     process.env.TWILIO_ACCOUNT_SID,
//     process.env.TWILIO_AUTH_TOKEN,
//   );

//   await twilio.messages.create({
//     body: `Your HAMS verification code is: ${code}. Expires in 5 minutes.`,
//     from: process.env.TWILIO_PHONE_NUMBER,
//     to: phone,
//   });
// }
