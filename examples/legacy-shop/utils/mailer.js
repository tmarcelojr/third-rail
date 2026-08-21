// Demo-grade mailer. Real system wires this to a transactional email provider.
function sendEmail({ to, subject, body }) {
  console.log(`[mailer] to=${to} subject="${subject}"`);
  return Promise.resolve({ sent: true });
}

module.exports = { sendEmail };
