import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

// Correos salen desde el Gmail del dueño de la app (contraseña de aplicación de Google).
// Variables: GMAIL_USER y GMAIL_APP_PASSWORD (en Vercel → Settings → Environment Variables).

export const mailEnabled = () => !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);

let transport: Transporter | null = null;
function getTransport() {
  transport ??= nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "") },
  });
  return transport;
}

export async function sendMail(to: string, subject: string, text: string, html: string) {
  if (!mailEnabled()) throw new Error("mail-off");
  await getTransport().sendMail({ from: `"Vamos feo pa'lante" <${process.env.GMAIL_USER}>`, to, subject, text, html });
}

export function resetEmail(name: string, link: string) {
  const text = `¡Epa ${name}! Para crear una contraseña nueva en Vamos feo pa'lante entra aquí (vale por 1 hora):\n\n${link}\n\nSi no fuiste tú, ignora este correo: tu contraseña sigue igual.`;
  const html = `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:480px;margin:auto;padding:24px;background:#f3ead8;border-radius:20px;color:#231c16">
  <p style="font-size:40px;margin:0">🤙</p>
  <h1 style="font-size:24px;margin:8px 0 4px">¡Epa ${escapeHtml(name)}!</h1>
  <p style="margin:0 0 20px">Pediste crear una contraseña nueva para <b>Vamos feo pa'lante</b>. El botón vale por 1 hora.</p>
  <a href="${link}" style="display:inline-block;background:#ff6a3d;color:#fffaf0;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:999px;border:2px solid #231c16">Crear contraseña nueva</a>
  <p style="font-size:13px;color:#73685a;margin-top:20px">Si no fuiste tú, ignora este correo: tu contraseña sigue igual.</p>
</div>`;
  return { text, html };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
