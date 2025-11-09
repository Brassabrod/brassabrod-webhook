// Serverless Function para Hotmart -> Supabase (com logs de debug)
const { createClient } = require("@supabase/supabase-js")

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE)

module.exports = async (req, res) => {
  console.log("🔥 Webhook recebido - método:", req.method)

  // Teste da Hotmart
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, message: "Webhook ativo" })
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" })
  }

  // Verificação de Hottok
  const hottok = req.headers["x-hotmart-hottok"]
  if (hottok !== process.env.HOTMART_HOTTOK) {
    console.warn("❌ Hottok inválido:", hottok)
    return res.status(401).json({ ok: false, error: "Unauthorized" })
  }

  // Parse do corpo
  let body = req.body
  if (typeof body === "string") {
    try { body = JSON.parse(body) } catch (e) {
      console.error("Erro ao fazer parse do JSON:", e)
    }
  }

  console.log("📦 Corpo recebido:", JSON.stringify(body, null, 2))

  const email = String(
    body?.buyer?.email ||
    body?.data?.buyer?.email ||
    body?.subscriber?.email ||
    body?.purchase?.buyer?.email ||
    ""
  ).toLowerCase()

  const event = String(
    body?.event ||
    body?.data?.event ||
    body?.status ||
    body?.purchase?.status ||
    ""
  ).toUpperCase()

  console.log("📨 E-mail:", email)
  console.log("🎯 Evento:", event)

  if (!email) {
    console.warn("⚠️ Nenhum e-mail encontrado")
    return res.status(400).json({ ok: false, error: "No email found" })
  }

  const allowEvents = [
    "PURCHASE_APPROVED",
    "PURCHASE_COMPLETE",
    "APPROVED",
    "COMPLETE",
    "SUBSCRIPTION_ACTIVATED",
    "CONFIRMED"
  ]
  const blockEvents = [
    "PURCHASE_REFUNDED",
    "PURCHASE_CANCELED",
    "PURCHASE_CANCELLED",
    "CANCELED",
    "CANCELLED",
    "REFUNDED",
    "CHARGEBACK",
    "SUBSCRIPTION_CANCELED",
    "SUBSCRIPTION_CANCELLED",
    "SUBSCRIPTION_EXPIRED",
    "EXPIRED"
  ]

  try {
    if (allowEvents.includes(event)) {
      console.log("✅ Evento permitido, adicionando e-mail ao Supabase...")
      const { error } = await supabase
        .from("allowed_emails")
        .upsert({ email, status: "active", source: "hotmart" }, { onConflict: "email" })
      if (error) throw error
      return res.status(200).json({ ok: true, action: "allowed", email, event })
    }

    if (blockEvents.includes(event)) {
      console.log("🚫 Evento de bloqueio, removendo e-mail do Supabase...")
      const { error } = await supabase
        .from("allowed_emails")
        .delete()
        .eq("email", email)
      if (error) throw error
      return res.status(200).json({ ok: true, action: "blocked", email, event })
    }

    console.log("ℹ️ Evento ignorado:", event)
    return res.status(200).json({ ok: true, action: "ignored", event })
  } catch (e) {
    console.error("🔥 Erro Supabase:", e.message)
    return res.status(500).json({ ok: false, error: e.message })
  }
}
