/**
 * Gerador de PIX BR Code (Pix Copia-e-Cola) seguindo o padrão EMV do BCB.
 *
 * Estrutura TLV (Tag-Length-Value):
 *   00  Payload Format Indicator    "01"
 *   26  Merchant Account Info (PIX)
 *     00  GUI                       "BR.GOV.BCB.PIX"
 *     01  Chave Pix (até 77 chars)
 *   52  Merchant Category Code      "0000"
 *   53  Currency                    "986" (BRL)
 *   54  Transaction Amount (opcional)
 *   58  Country Code                "BR"
 *   59  Merchant Name (até 25)
 *   60  Merchant City (até 15)
 *   62  Additional Data
 *     05  TXID                      "***" (livre)
 *   63  CRC16-CCITT(False) hex maiúsculo
 */

const sanitize = (s: string, max: number) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .replace(/[^A-Za-z0-9 ]/g, "")
    .slice(0, max)
    .toUpperCase();

const tlv = (id: string, value: string) =>
  `${id}${value.length.toString().padStart(2, "0")}${value}`;

const crc16 = (payload: string): string => {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
};

export interface PixBrCodeInput {
  pixKey: string;
  beneficiaryName: string;
  city?: string;
  amount?: number;
  txId?: string;
}

export function generatePixBrCode({
  pixKey,
  beneficiaryName,
  city = "BRASIL",
  amount,
  txId = "***",
}: PixBrCodeInput): string {
  if (!pixKey?.trim()) return "";

  const merchantAccount =
    tlv("00", "BR.GOV.BCB.PIX") + tlv("01", pixKey.trim());

  const additionalData = tlv("05", txId);

  const fields = [
    tlv("00", "01"),
    tlv("26", merchantAccount),
    tlv("52", "0000"),
    tlv("53", "986"),
    ...(amount && amount > 0 ? [tlv("54", amount.toFixed(2))] : []),
    tlv("58", "BR"),
    tlv("59", sanitize(beneficiaryName, 25) || "BENEFICIARIO"),
    tlv("60", sanitize(city, 15) || "BRASIL"),
    tlv("62", additionalData),
  ].join("");

  // CRC é calculado sobre tudo + o tag/length do próprio CRC ("6304")
  const payloadForCrc = fields + "6304";
  const crc = crc16(payloadForCrc);

  return fields + "6304" + crc;
}
