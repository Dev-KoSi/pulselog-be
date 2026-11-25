/**
 * Index numbers are typed many ways on phones: "EF/BPS/24/0023", "ef/bps/24/0023",
 * "EFBPS240023", "EF BPS 24 23", "EF-BPS-24-023". All of these collapse to the same
 * key: uppercase, punctuation stripped, serial zero-padded to 4 digits.
 */
function indexKey(input) {
  const compact = String(input ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  const match = compact.match(/^([A-Z]+)(\d{2})(\d{1,4})$/);
  return match ? `${match[1]}${match[2]}${match[3].padStart(4, '0')}` : compact;
}

module.exports = { indexKey };
