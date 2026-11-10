import { INSTALL_COMMAND, kitSnippet, soroban } from "../../lib/docs-snippets";
import type { DocsContent, FaqItem } from "./types";

const SDK_INSTALL = "pnpm add spare-sdk @stellar/stellar-sdk";

const ADD_DONATION = `import { addDonation, HorizonAccountPort } from "spare-sdk";

const result = await addDonation(unsignedTx, {
  foundation: { account: "G...", domain: "foundation.org" }, // must be listed in its stellar.toml
  amount: "0.50",            // or: roundUp: true (only when the purchase is USDC)
  appId: "my-app",           // <= 22 ASCII bytes, memo becomes "spare:my-app"
  maxAmount: "5",            // your cap per donation
  accounts: new HorizonAccountPort("https://horizon.stellar.org"),
});

switch (result.status) {
  case "offered":      // ask the user "Add US$<result.donation.amount>?", then sign result.transaction
  case "not-offered":  // sign the original tx; result.reason says why (e.g. "insufficient-balance")
  case "passthrough":  // signed / fee-bump / multisig / extra signers / Soroban: sign the original tx
}`;

const DONATE_AFTER = `import { donateAfter } from "spare-sdk";

const follow = await donateAfter(
  { successful: true, sourceAccount: userAccount, hash },
  { foundation, amount: "0.50", appId: "my-app", maxAmount: "5",
    accounts, networkPassphrase: Networks.PUBLIC },
);
if (follow.status === "offered") { /* confirm, then sign follow.transaction */ }`;

const TOML = `ACCOUNTS=["G..."]   # the foundation account registered in the Spare registry`;

export const esFaq: FaqItem[] = [
  { id: "custody", q: "¿Spare custodia el dinero?", a: "No. Los fondos van de la persona a la fundación en un pago normal de Stellar. Spare nunca retiene fondos y no cobra comisión." },
  { id: "fees", q: "¿Quién paga la comisión?", a: "Una donación clásica es una operación de pago más en la misma transacción, así que la comisión de la transacción sube en una operación. El seguimiento en Soroban es su propia transacción de pago, con su propia comisión. Spare revisa que la persona pueda cubrir la donación y la comisión antes de ofrecer nada." },
  { id: "round-up", q: "¿Cómo funciona el redondeo?", a: "El redondeo suma lo necesario para llegar al próximo dólar entero, y solo cuando toda la transacción es una compra en USDC de Circle (pagos, `pathPaymentStrictSend`, ofertas de venta). Si el monto ya es entero, o el gasto real no se conoce de antemano, solo se ofrece un monto fijo." },
  { id: "soroban", q: "¿Por qué una llamada Soroban necesita una segunda firma?", a: "Una transacción Soroban solo puede tener una operación, así que la donación no puede ir dentro. Spare envía un pago aparte cuando la llamada resulta bien, y la confirmación lo avisa antes de que la persona acepte." },
  { id: "ledger", q: "¿Qué ve quien usa Ledger?", a: "La donación es su propia operación de pago, así que el dispositivo muestra “Payment 0.50 USDC to …” antes de aprobar." },
  { id: "privacy", q: "¿El tablero muestra quién donó?", a: "No. El tablero público agrega por app y por fundación y nunca lista direcciones de donantes." },
  { id: "verification", q: "¿Cómo se verifica una fundación?", a: "Una fundación registra su cuenta en el contrato de registro de Spare y lista la misma cuenta en el campo `ACCOUNTS` del `stellar.toml` de su sitio (SEP-1). Nadie lo aprueba a mano. “Dominio verificado” significa exactamente eso, nada más." },
  { id: "declines", q: "¿Y si la persona dice que no, o algo falla?", a: "Si dice que no, se firma la transacción original, byte por byte. Si falla una verificación (sin trustline, saldo bajo, sobre tu tope, fundación sin verificar) no se ofrece nada, y si algo dentro de Spare da error se firma la original." },
];

export const esDocs: DocsContent = {
  introduction: {
    title: "Introducción",
    metaTitle: "Introducción — Documentación de Spare",
    lead: "Spare es un kit de código abierto para que cualquier app de Stellar ofrezca una donación en USDC por transacción al momento de firmar. La donación va directo a la fundación. Spare nunca retiene fondos y no cobra comisión.",
    blocks: [
      { t: "h2", id: "why", text: "Por qué" },
      { t: "p", text: "En las farmacias y supermercados de Chile la persona en caja pregunta “¿Dona su vuelto?”. Los montos chicos suman plata real para las fundaciones. En Stellar las comisiones son tan bajas que vale la pena enviar una donación de US$0,50, pero ningún paquete permite que una app existente la sume al firmar." },
      { t: "h2", id: "how-it-works", text: "Cómo funciona" },
      { t: "p", text: "Antes de firmar, tu app pregunta “¿Sumar US$0,50 para [fundación]?” o “¿Redondear al próximo dólar?”. Si la persona dice que sí, la donación viaja junto con su pago." },
      {
        t: "table",
        head: ["Tipo de transacción", "Qué hace Spare", "Firmas"],
        rows: [
          ["Clásica (pagos, pagos con ruta, cualquier operación clásica)", "Agrega un pago en USDC a la fundación en la misma transacción. La compra y la donación resultan bien o fallan juntas.", "Una"],
          ["Soroban (`InvokeHostFunction`)", "Una transacción Soroban solo puede tener una operación, así que Spare envía un pago de seguimiento etiquetado cuando la llamada resulta bien. El modal lo avisa antes de que la persona acepte.", "Dos"],
          ["Ledger (con Stellar Wallets Kit)", "La donación es su propia operación de pago, así que el dispositivo muestra “Payment 0.50 USDC to …” antes de aprobar.", "Una"],
        ],
      },
      { t: "p", text: "Cada donación de Spare lleva el memo `spare:<appId>`, así que se puede rastrear en la cadena y atribuir a la app que la envió." },
      { t: "p", text: "Las fundaciones se verifican solas con un estándar de Stellar: la fundación registra su cuenta en el contrato de registro de Spare y lista la misma cuenta en el campo `ACCOUNTS` del `stellar.toml` de su sitio ([SEP-1](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0001.md)). Nadie lo aprueba a mano." },
      { t: "h2", id: "guarantees", text: "Garantías" },
      {
        t: "list",
        items: [
          "La persona siempre decide. No se agrega nada sin un sí explícito. Si dice que no, se firma la transacción original, byte por byte.",
          "Sin custodia. Los fondos van de la persona a la fundación en un pago normal de Stellar.",
          "Solo USDC de Circle (`GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`). Los activos parecidos se rechazan.",
          "Solo fundaciones con dominio verificado. “Dominio verificado” significa que la cuenta está listada en el `stellar.toml` de ese sitio, nada más.",
          "Nunca bloquea un pago. Si falla una verificación (sin trustline, saldo bajo, sobre tu tope, fundación sin verificar) no se ofrece donación. Si algo dentro de Spare da error, se firma la transacción original.",
          "Paso directo seguro. Las transacciones parcialmente firmadas, multisig, fee-bump y Soroban nunca se modifican.",
          "Privado por diseño. El tablero público agrega por app y por fundación y nunca lista direcciones de donantes.",
        ],
      },
      { t: "h2", id: "packages", text: "Paquetes" },
      {
        t: "table",
        head: ["Paquete", "Descripción", "Estado"],
        rows: [
          ["`spare-sdk`", "Biblioteca TypeScript central: agrupación en transacciones clásicas, seguimiento Soroban, revisiones de elegibilidad, verificación de `stellar.toml`.", "Listo"],
          ["`spare-wallets-kit`", "Envoltorio de Stellar Wallets Kit con un modal de confirmación accesible (EN/ES, claro/oscuro).", "Listo"],
          ["Contrato de registro", "Registro de fundaciones en Soroban. Sin admin, sin función de actualización, sin fondos.", "Listo, sin desplegar"],
          ["Indexador y tablero", "Eventos del registro y pagos USDC etiquetados, mostrados por fundación.", "Planificado"],
        ],
      },
      { t: "h2", id: "out-of-scope", text: "Fuera de alcance" },
      { t: "p", text: "Juntar o dividir donaciones, elegir o evaluar causas, recibos tributarios, rampas de entrada y salida de dinero fiat, y extensiones de navegador que modifiquen las transacciones de otras wallets." },
    ],
  },
  "quick-start": {
    title: "Guía rápida",
    metaTitle: "Guía rápida — Documentación de Spare",
    lead: "Añade la pregunta del vuelto a tu app en Stellar. Este recorrido cubre la instalación del SDK, el kit de wallets y la primera prueba del flujo de confirmación.",
    blocks: [
      { t: "code", code: INSTALL_COMMAND, label: "Instalar" },
      { t: "h2", id: "install", text: "1. Instala los paquetes", toc: "Instalar" },
      { t: "p", text: "Agrega spare-sdk y spare-wallets-kit a tu app. El kit abre la confirmación en wallets como Freighter, LOBSTR o Ledger." },
      { t: "h2", id: "add-the-kit", text: "2. Haz la pregunta al firmar", toc: "Añadir el kit" },
      { t: "p", text: "Antes de la firma, muestra la opción de sumar un poco o redondear para una fundación del registro." },
      { t: "h3", text: "Transacciones clásicas" },
      { t: "code", code: kitSnippet("es"), label: "Transacciones clásicas" },
      { t: "h3", text: "Llamadas Soroban" },
      { t: "code", code: soroban, label: "Llamadas Soroban" },
      { t: "p", text: "¿Construyes tu propia interfaz? Usa `addDonation` (clásicas) o `donateAfter` (Soroban) de [spare-sdk](doc:spare-sdk) directamente." },
      { t: "h2", id: "try-the-flow", text: "3. Deja el registro a la vista", toc: "Probar el flujo" },
      { t: "p", text: "El aporte va directo a la fundación. El indexador y el tablero publican el movimiento." },
      { t: "callout", id: "next-step", title: "Ellos deciden, siempre.", body: "La persona puede sumar un poco, cambiar el monto, o seguir sin aportar. Spare nunca custodia los fondos. El movimiento queda en el registro público." },
    ],
  },
  "spare-sdk": {
    title: "spare-sdk",
    metaTitle: "spare-sdk — Documentación de Spare",
    lead: "Suma una microdonación en USDC por transacción a cualquier app de Stellar. La donación va directo a la cuenta de la fundación; Spare nunca retiene fondos. Solo USDC de Circle, solo fundaciones con dominio verificado.",
    blocks: [
      { t: "h2", id: "install", text: "Instalar" },
      { t: "code", code: SDK_INSTALL, label: "Instalar" },
      { t: "p", text: "`@stellar/stellar-sdk` es una peer dependency: instálala junto a `spare-sdk` (una sola copia compartida con tu app)." },
      { t: "h2", id: "add-donation", text: "Transacción clásica: addDonation", toc: "addDonation" },
      { t: "code", code: ADD_DONATION, label: "addDonation" },
      { t: "p", text: "`offered` devuelve una transacción nueva sin firmar (hash nuevo, comisión subida en una operación, memo puesto solo si estaba vacío y ningún destino exige uno). No se agrega nada sin el sí explícito de la persona." },
      { t: "h2", id: "round-up", text: "Redondeo" },
      { t: "p", text: "Solo cuando toda la transacción es una compra en USDC de Circle (pagos, `pathPaymentStrictSend`, ofertas de venta). El SDK informa lo que usó, así que muestra estos valores en vez de recalcular: `donation.purchase` / `purchaseStroops` (la compra en USDC) y `roundedTotal` / `roundedTotalStroops` (compra más donación). Solo vienen definidos en el redondeo." },
      { t: "list", items: ["Ya es entero (por ejemplo 5.00): `round-up-already-whole`.", "`pathPaymentStrictReceive`, operaciones en XLM u otro activo, o operaciones no modeladas en la misma transacción: `round-up-needs-usdc-purchase` (el gasto real no se conoce de antemano, así que Spare nunca redondea `sendMax`)."] },
      { t: "h2", id: "donate-after", text: "Llamada Soroban: donateAfter", toc: "donateAfter" },
      { t: "p", text: "Una transacción Soroban tiene una sola operación, así que la donación es un pago aparte después del éxito. Necesita una segunda firma: avísale a la persona antes de que acepte." },
      { t: "code", code: DONATE_AFTER, label: "donateAfter" },
      { t: "p", text: "El seguimiento es un único pago (umbral medio). Si la cuenta de la persona necesita más que su llave maestra para firmarlo, no se ofrece nada (`multisig`)." },
      { t: "h2", id: "results", text: "Resultados y códigos de motivo", toc: "Códigos de motivo" },
      {
        t: "table",
        head: ["Estado", "Significado"],
        rows: [
          ["`offered`", "Una `transaction` nueva sin firmar, la información de `donation` y el `fee`. Pregunta a la persona y luego fírmala."],
          ["`not-offered`", "La transacción está bien pero no se debe ofrecer donación. `reason` dice por qué. Firma la original."],
          ["`passthrough`", "Spare no puede modificar la transacción de forma segura. Queda intacta. Firma la original."],
        ],
      },
      { t: "h3", text: "Motivos de passthrough" },
      {
        t: "table",
        head: ["Motivo", "Significado"],
        rows: [
          ["`fee-bump`", "La transacción es un fee-bump."],
          ["`already-signed`", "La transacción ya tiene firmas."],
          ["`soroban`", "Una transacción Soroban: usa `donateAfter`."],
          ["`multiple-sources`", "Más de una cuenta de origen."],
          ["`multisig`", "La llave maestra sola no alcanza el umbral de la transacción: medio, o alto con `setOptions` / `accountMerge`."],
          ["`extra-signers`", "Está puesta la precondición `extraSigners` de CAP-21."],
        ],
      },
      { t: "h3", text: "Motivos de not-offered" },
      {
        t: "table",
        head: ["Motivo", "Significado"],
        rows: [
          ["`invalid-options`", "Las opciones están mal formadas, incluido un `baseFee` mal formado."],
          ["`invalid-app-id`", "`appId` no es válido (como máximo 22 bytes ASCII)."],
          ["`invalid-amount`", "El monto no es un monto USDC válido."],
          ["`invalid-foundation`", "La fundación está mal formada."],
          ["`amount-over-cap`", "La donación supera tu `maxAmount`."],
          ["`round-up-needs-usdc-purchase`", "El redondeo necesita una compra en USDC de Circle (ver arriba)."],
          ["`round-up-already-whole`", "La compra ya es un monto entero."],
          ["`foundation-not-verified`", "La cuenta de la fundación no está listada en el `stellar.toml` de su sitio."],
          ["`foundation-trustline-missing`", "La fundación no tiene trustline de USDC."],
          ["`foundation-trustline-unauthorized`", "La trustline de USDC de la fundación no está autorizada."],
          ["`foundation-trustline-full`", "No queda espacio bajo el límite de la trustline de la fundación."],
          ["`user-trustline-missing`", "La persona no tiene trustline de USDC."],
          ["`user-trustline-unauthorized`", "La trustline de USDC de la persona no está autorizada."],
          ["`unsupported-operation`", "La transacción tiene operaciones que pueden gastar fondos de formas que Spare no modela, por ejemplo `manageBuyOffer`, `createClaimableBalance`, `liquidityPoolDeposit`, `accountMerge`."],
          ["`multisig`", "Solo desde `donateAfter`: el seguimiento necesita más que la llave maestra."],
          ["`insufficient-balance`", "No alcanza el USDC, o el XLM para la comisión más el XLM que envía la transacción."],
          ["`account-lookup-failed`", "No se pudo cargar la cuenta."],
          ["`main-tx-not-successful`", "Solo `donateAfter`: la transacción principal no resultó bien."],
        ],
      },
      { t: "h2", id: "donation-info", text: "DonationInfo", toc: "DonationInfo" },
      {
        t: "table",
        head: ["Campo", "Descripción"],
        rows: [
          ["`amount`", "Monto en USDC, 7 decimales. Muéstraselo a la persona antes de firmar."],
          ["`amountStroops`", "El mismo monto en stroops (`bigint`)."],
          ["`foundation`", "La cuenta de la fundación."],
          ["`attributed`", "Falso cuando la transacción ya tenía un memo, así que la donación no se puede etiquetar para la app."],
          ["`purchase`, `purchaseStroops`", "Solo redondeo: la compra en USDC que la transacción ya hace."],
          ["`roundedTotal`, `roundedTotalStroops`", "Solo redondeo: la compra más la donación."],
        ],
      },
      { t: "h2", id: "options", text: "Opciones" },
      {
        t: "table",
        head: ["Opción", "Descripción"],
        rows: [
          ["`foundation`", "`{ account, domain }`: la cuenta G... y el hostname cuyo `stellar.toml` debe listarla."],
          ["`appId`", "Como máximo 22 bytes ASCII. El memo queda como `spare:<appId>`."],
          ["`maxAmount`", "Tu tope por donación, en USDC."],
          ["`accounts`", "Un `AccountPort` (por ejemplo `HorizonAccountPort`)."],
          ["`fetch`", "Opcional. Fetch inyectable, por defecto el global."],
          ["`baseFee`", "Opcional. Comisión por operación en stroops, solo dígitos, mínimo 100."],
        ],
      },
      { t: "h2", id: "account-port", text: "Puerto de cuenta", toc: "AccountPort" },
      { t: "p", text: "`AccountPort.loadAccount(id)` devuelve un `AccountSnapshot`, o `null` cuando la cuenta no existe. `HorizonAccountPort` lo llena desde Horizon (`headroom` = límite - saldo - pasivos de compra; `memoRequired` desde la entrada de datos `config.memo_required`). Spare decide sobre múltiples firmas con `masterWeight` y `thresholds` por transacción." },
      {
        t: "table",
        head: ["Campo", "Descripción"],
        rows: [
          ["`sequence`", "Número de secuencia actual (la próxima transacción usa sequence + 1)."],
          ["`xlmAvailable`", "XLM disponible para comisiones: saldo menos reserva y pasivos de venta."],
          ["`usdc`", "Trustline de USDC de Circle `{ balance, authorized, headroom }`, o `null` si no hay."],
          ["`masterWeight`", "Peso de la llave propia de la cuenta; 0 cuando está desactivada."],
          ["`thresholds`", "`{ low, medium, high }`, de 0 a 255."],
          ["`memoRequired`", "SEP-29: la cuenta espera un memo en los pagos entrantes."],
        ],
      },
      { t: "h2", id: "memo-fees", text: "Memo, SEP-29 y comisiones", toc: "Memo y comisiones" },
      { t: "p", text: "Si el destino de un pago, pago con ruta o merge tiene `config.memo_required`, Spare no pone su memo, así que el `checkMemoRequired` de tu app sigue funcionando. La donación igual se ofrece, con `donation.attributed === false`. Un destino que no se puede leer se trata como memo requerido." },
      { t: "p", text: "`baseFee` es por operación, solo dígitos, mínimo 100 stroops. Un valor mal formado da `not-offered` / `invalid-options`; nunca lanza error. Una transacción con comisión 0 sube a 100 por operación, y el mismo número se usa para la revisión de saldo y para la transacción construida." },
      { t: "h2", id: "helpers", text: "Utilidades" },
      {
        t: "list",
        items: [
          "`verifyFoundation(foundation)` y `listVerifiedFoundations(candidates)`: la revisión SEP-1 de `ACCOUNTS` (solo https, sin redirecciones, 5 s de timeout, cuerpo limitado a 100 KB).",
          "`parseUsdc`, `formatStroops`, `roundUpToWholeDollar`: utilidades de montos.",
          "`isValidAppId`, `memoFor`: validación del app id y el memo.",
          "`USDC_ISSUER`, `USDC_CODE`: las constantes de USDC de Circle.",
          "El acceso a la red (`fetch`, `AccountPort`) es inyectable.",
        ],
      },
    ],
  },
  "spare-wallets-kit": {
    title: "spare-wallets-kit",
    metaTitle: "spare-wallets-kit — Documentación de Spare",
    lead: "Suma Spare a una app que firma con Stellar Wallets Kit: antes de cada firma, la persona ve “¿Sumar US$0,50 para [fundación]?” y decide. No se agrega nada sin un sí explícito. Spare nunca retiene fondos.",
    blocks: [
      { t: "h2", id: "install", text: "Instalar" },
      { t: "code", code: INSTALL_COMMAND, label: "Instalar" },
      { t: "h2", id: "quickstart", text: "Guía rápida" },
      { t: "code", code: kitSnippet("es"), label: "withSpare" },
      { t: "p", text: "¿Necesitas saber si cambió el hash? Usa `signWithDonation`: devuelve `{ signedTxXdr, donation, changed, outcome }`." },
      { t: "h2", id: "soroban", text: "Seguimiento en Soroban" },
      { t: "p", text: "Una transacción Soroban tiene una sola operación, así que la donación es un pago aparte después de que tu llamada resulte bien. Necesita una segunda firma, y el modal lo avisa." },
      { t: "code", code: soroban, label: "offerFollowUp" },
      { t: "h2", id: "api", text: "API" },
      {
        t: "table",
        head: ["Export", "Qué hace"],
        rows: [
          ["`withSpare(kit, options)`", "Devuelve `{ signTransaction, signWithDonation, offerFollowUp, lastDonation }`."],
          ["`createConfirmModal({ locale?, theme? })`", "Interfaz de confirmación por defecto (DOM puro, shadow root). Resuelve `true` solo con el botón principal."],
        ],
      },
      { t: "h2", id: "options", text: "Opciones" },
      {
        t: "table",
        head: ["Opción", "Requerida", "Descripción"],
        rows: [
          ["`foundation`", "sí", "`{ account, domain }`. Dominio verificado mediante el `stellar.toml` de SEP-1."],
          ["`foundationName`", "no", "Nombre que ve la persona. Por defecto, el dominio."],
          ["`mode`", "sí", "`{ amount: \"0.50\" }` o `{ roundUp: true }` (solo compras en USDC)."],
          ["`appId`", "sí", "Etiqueta para el memo `spare:<appId>`."],
          ["`maxAmount`", "sí", "Tu tope por donación, en USDC."],
          ["`accounts`", "sí", "`AccountPort` de spare-sdk (por ejemplo `HorizonAccountPort`)."],
          ["`fetch`", "no", "Fetch propio para consultar `stellar.toml`."],
          ["`networkPassphrase`", "no", "Se usa para leer el XDR cuando la llamada no lo recibe. Sin ninguno, la transacción se firma sin cambios."],
          ["`confirm`", "no", "`(prompt: DonationPrompt) => Promise<boolean>`. Reemplaza el modal integrado."],
          ["`locale` / `theme`", "no", "`\"en\" | \"es\"`; `\"light\" | \"dark\" | \"auto\"` para el modal integrado."],
          ["`wallet`", "no", "Id de wallet (o función). Por defecto `kit.selectedModule.productId`. `LEDGER` muestra la nota “revisa tu Ledger”."],
          ["`followUpAmount`", "no", "Monto del seguimiento en Soroban. Por defecto el `mode.amount` fijo; obligatorio con redondeo."],
        ],
      },
      { t: "h2", id: "results", text: "Resultados" },
      { t: "p", text: "`signWithDonation` devuelve `{ signedTxXdr, donation, changed, outcome, reason? }`. `outcome` es uno de `donated`, `declined`, `not-offered`, `passthrough` o `error`. `donation` es null cuando se firmó la transacción original, y `changed` es true cuando la transacción firmada no es la que pasaste." },
      { t: "p", text: "`offerFollowUp` resuelve a `{ status: \"signed\", signedTxXdr, donation }` o `{ status: \"skipped\", reason }`. Enviarla es tu trabajo." },
      { t: "h2", id: "prompt", text: "DonationPrompt y confirmación propia", toc: "DonationPrompt" },
      { t: "p", text: "`DonationPrompt` es `{ amount, foundationName, foundationDomain, mode: \"fixed\" | \"round-up\", wallet: \"classic\" | \"soroban\" | \"ledger\", locale, secondSignature, purchaseTotal?, roundUpTotal? }`. `purchaseTotal` y `roundUpTotal` vienen directo de `donation.purchase` / `donation.roundedTotal` de spare-sdk. Pasa tu propio `confirm` para reemplazar el modal; devuelve `true` solo con un sí explícito." },
      { t: "h2", id: "pass-through", text: "Reglas de paso directo", toc: "Paso directo" },
      {
        t: "list",
        items: [
          "Solo se modifican transacciones sin firmar, sin fee-bump, clásicas y de un solo firmante de origen. Agregar una operación cambia el hash y la comisión, así que todo lo demás (parcialmente firmadas, multisig, firmantes extra, fee-bump, Soroban) se firma sin cambios y no se ofrece donación.",
          "Una revisión fallida en spare-sdk (fundación sin verificar, sin trustline, saldo bajo, sobre el tope) significa que no hay pregunta y se firma la original.",
          "Si la persona dice que no: se firma el XDR original, byte por byte.",
          "Cualquier error dentro de Spare (XDR inválido, falla de consulta, caída del confirm) falla cerrado: se firma la original. Los errores de la wallet, por ejemplo cuando la persona rechaza en la wallet, no se tragan.",
        ],
      },
      { t: "h2", id: "modal", text: "Modal integrado" },
      { t: "p", text: "`role=\"dialog\"`, `aria-modal`, título etiquetado, trampa de foco, Esc lo omite, el foco vuelve a quien lo abrió, se respeta `prefers-reduced-motion`. Muestra “Dominio verificado: <dominio>” bajo el título: el `stellar.toml` de la fundación lista su cuenta, nada más. El foco empieza en el diálogo, no en un botón, el botón principal ignora la activación durante los primeros 400 ms, y el resto de la página queda `inert` mientras está abierto. Los estilos viven en un shadow root. Las fuentes (Instrument Sans, Newsreader) no vienen incluidas: cárgalas tú o se usan las del sistema." },
    ],
  },
  registry: {
    title: "Registro",
    metaTitle: "Registro — Documentación de Spare",
    lead: "Un contrato Soroban con una entrada de registro por cuenta de fundación. Sin admin, sin función de actualización, sin manejo de tokens, sin fondos. Solo la cuenta de la propia fundación puede escribir su entrada.",
    blocks: [
      { t: "callout", title: "Estado", body: "Listo y probado, aún sin desplegar. Construido con soroban-sdk 25.3.0." },
      { t: "h2", id: "register", text: "Registrar una fundación" },
      { t: "p", text: "La fundación llama a `register(account, name, website)` firmado por su propia cuenta (`account.require_auth()`). Luego lista la misma cuenta en el campo `ACCOUNTS` del `stellar.toml` de su sitio. Las dos cosas juntas la dejan con dominio verificado; mira la [verificación de stellar.toml](doc:stellar-toml). Nadie lo aprueba a mano." },
      { t: "h2", id: "functions", text: "Funciones" },
      {
        t: "table",
        head: ["Función", "Auth", "Resultado"],
        rows: [
          ["`register(account, name, website)`", "`account`", "Crea una entrada activa, o reactiva una desactivada (sobrescribe nombre y sitio)."],
          ["`update(account, name, website)`", "`account`", "Reemplaza nombre y sitio de una entrada activa."],
          ["`deactivate(account)`", "`account`", "Marca la entrada como inactiva (queda guardada)."],
          ["`get(account) -> Option<Foundation>`", "ninguna", "`Foundation { name, website, active }`."],
          ["`is_active(account) -> bool`", "ninguna", "`false` si no existe o está inactiva."],
        ],
      },
      { t: "p", text: "La validación ocurre después de la autenticación y antes de guardar. `name`: de 1 a 64 bytes UTF-8. `website`: de 1 a 253 bytes, un dominio simple sin `/` (o sea, sin esquema ni ruta), sin espacios ni bytes de control. Es solo una revisión de formato; la propiedad del dominio se verifica fuera de la cadena mediante `stellar.toml` (SEP-1)." },
      { t: "h2", id: "errors", text: "Errores" },
      {
        t: "table",
        head: ["Código", "Nombre", "Cuándo"],
        rows: [
          ["1", "`AlreadyRegistered`", "`register` y ya existe una entrada activa."],
          ["2", "`NotFound`", "`update` o `deactivate` sin entrada."],
          ["3", "`Inactive`", "`update` o `deactivate` sobre una entrada desactivada."],
          ["4", "`InvalidName`", "Nombre vacío o de más de 64 bytes."],
          ["5", "`InvalidWebsite`", "Sitio vacío, de más de 253 bytes, o con `/`, espacios o bytes de control."],
        ],
      },
      { t: "h2", id: "events", text: "Eventos" },
      { t: "p", text: "Los topics son `[\"spare\", <kind>, account]`; los datos son un vec `[name, website]`. Las llamadas fallidas no emiten nada." },
      {
        t: "table",
        head: ["Tipo", "Lo emite", "Datos"],
        rows: [
          ["`register`", "`register`", "Nombre y sitio nuevos."],
          ["`update`", "`update`", "Nombre y sitio nuevos."],
          ["`deactivate`", "`deactivate`", "Último nombre y sitio."],
        ],
      },
      { t: "h2", id: "deactivation", text: "Desactivación" },
      {
        t: "list",
        items: [
          "`deactivate` mantiene la entrada con `active = false`; nunca se borra, así que el indexador conserva el historial.",
          "La desactivación es reversible: `register` sobre una cuenta desactivada la reactiva (nombre y sitio sobrescritos tras la validación de siempre, TTL extendido, evento `register` normal). Necesita la autenticación de la propia cuenta.",
          "`register` sobre una entrada activa es `AlreadyRegistered`; `update` o `deactivate` sobre una entrada desactivada son `Inactive`.",
          "Por cuenta, el indexador ve `register -> (update | deactivate -> register)*`. Un evento `register` de una cuenta ya conocida significa reactivación.",
        ],
      },
      { t: "h2", id: "ttl", text: "TTL" },
      { t: "p", text: "Las entradas viven en almacenamiento persistente. `register` y `update` extienden el TTL: el umbral es de unos 30 días (`30 * 17_280` ledgers) y la extensión llega a unos 60 días. Las entradas sin tocar por unos 60 días expiran; el indexador marca las que están cerca de expirar para que la fundación llame a `update` y las renueve. `get` e `is_active` no extienden. Las entradas desactivadas no se extienden mientras están inactivas y pueden expirar del estado del ledger; reactivar una entrada expirada es un `register` nuevo." },
    ],
  },
  "indexer-dashboard": {
    title: "Indexer y tablero",
    metaTitle: "Indexer y tablero — Documentación de Spare",
    lead: "El registro público de lo que las fundaciones reciben a través de Spare.",
    blocks: [
      { t: "planned", title: "Planificado", body: "El indexador y el tablero aún no están construidos. Esta página describe lo que harán y cambiará a medida que se publiquen." },
      { t: "h2", id: "indexer", text: "Indexador" },
      { t: "p", text: "Ingiere eventos del registro y pagos USDC etiquetados, y se puede reconstruir desde Horizon. Las donaciones se atribuyen a una app mediante el memo `spare:<appId>`; una donación que no se pudo etiquetar (`donation.attributed === false`) no se puede atribuir a una app." },
      { t: "h2", id: "dashboard", text: "Tablero" },
      { t: "p", text: "Páginas públicas por fundación con totales, apps y enlaces a transacciones. Agrega por app y por fundación y nunca lista direcciones de donantes." },
    ],
  },
  "stellar-toml": {
    title: "Verificación stellar.toml",
    metaTitle: "Verificación stellar.toml — Documentación de Spare",
    lead: "Spare solo trabaja con fundaciones de dominio verificado. La verificación usa un estándar de Stellar, SEP-1, así que nadie aprueba una fundación a mano.",
    blocks: [
      { t: "h2", id: "how", text: "Cómo se verifica una fundación" },
      { t: "p", text: "La fundación registra su cuenta en el contrato de registro de Spare y lista la misma cuenta en el campo `ACCOUNTS` del `stellar.toml` de su sitio ([SEP-1](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0001.md))." },
      { t: "code", code: TOML, label: "stellar.toml" },
      { t: "h2", id: "checks", text: "Qué revisa Spare" },
      {
        t: "list",
        items: [
          "El `stellar.toml` se descarga solo por https.",
          "No se siguen redirecciones.",
          "La solicitud tiene un timeout de 5 segundos.",
          "El cuerpo está limitado a 100 KB (se revisa con Content-Length y mientras se recibe).",
          "La cuenta de la fundación debe aparecer en `ACCOUNTS`.",
        ],
      },
      { t: "h2", id: "meaning", text: "Qué significa “dominio verificado”" },
      { t: "p", text: "Significa exactamente eso: la cuenta está listada en el `stellar.toml` de ese sitio. No es un respaldo, una evaluación de la causa ni una garantía sobre cómo la fundación usa los fondos." },
    ],
  },
  faq: {
    title: "Preguntas frecuentes",
    metaTitle: "Preguntas frecuentes — Documentación de Spare",
    lead: "Respuestas cortas sobre custodia, comisiones, redondeo, firmas y privacidad.",
    blocks: [{ t: "faq" }],
  },
};
