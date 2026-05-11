const nodemailer = require("nodemailer");
require("dotenv").config();

/**
 * Configuration du transporteur Nodemailer
 * Adapté pour fonctionner avec les variables MAIL_HOST, MAIL_PORT, etc.
 */
const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: parseInt(process.env.MAIL_PORT) || 465,
  secure: process.env.MAIL_PORT == 465, // true pour 465, false pour les autres
  auth: {
    user: process.env.MAIL_USERNAME,
    pass: process.env.MAIL_PASSWORD
      ? process.env.MAIL_PASSWORD.replace(/"/g, "")
      : "",
  },
  tls: {
    rejectUnauthorized: false, // Nécessaire pour certains serveurs SMTP privés
  },
});

/**
 * Vérification de la connexion au démarrage
 */
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ Erreur de connexion SMTP :");
    console.error(`   Host: ${process.env.MAIL_HOST}`);
    console.error(`   Port: ${process.env.MAIL_PORT}`);
    console.error(`   User: ${process.env.MAIL_USERNAME}`);
    console.error(`   Error message: ${error.message}`);
  } else {
    console.log(
      "✅ Connexion au serveur SMTP réussie ! Prêt à envoyer des emails.",
    );
  }
});

/**
 * Envoi de l'OTP par email
 */
async function sendOtpEmail(to, otpCode, userName = "Partenaire") {
  const mailOptions = {
    from: `"${"VPC Partenaire"}" <${process.env.MAIL_FROM_ADDRESS || process.env.MAIL_USERNAME}>`,
    to,
    subject: "🔐 Code de vérification VPC Partenaire",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px;">
        <h2 style="color: #4f46e5; text-align: center;">VPC Partenaire</h2>
        <p>Bonjour <strong>${userName}</strong>,</p>
        <p>Votre code de vérification est :</p>
        <div style="background-color: #f3f4f6; padding: 16px; text-align: center; border-radius: 8px; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #4f46e5;">${otpCode}</span>
        </div>
        <p style="font-size: 14px; color: #6b7280;">Ce code est valable pendant 5 minutes. Ne le partagez avec personne.</p>
        <hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 24px 0;">
        <p style="font-size: 12px; color: #9ca3af; text-align: center;">Ceci est un message automatique, merci de ne pas y répondre.</p>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 OTP envoyé à ${to} — Message ID: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Erreur envoi email OTP:", error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  transporter,
  sendOtpEmail,
};
