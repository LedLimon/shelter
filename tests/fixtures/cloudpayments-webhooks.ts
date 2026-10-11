// Bodies of CloudPayments notifications, composed from the field tables of
// developers.cloudpayments.ru («Уведомления», read on 2026-10-11) — not
// captured from a live terminal: there is none yet (ORG-2). Replace them with
// real captures once a test terminal exists.
//
// URL-encoding here is deliberately not our simulator's (lowercase hex
// escapes): parsing must not depend on the style. `contentHmac` was computed
// outside our code (Python's hmac) with FIXTURE_API_SECRET, so the tests check
// the algorithm, not our own echo.

export const FIXTURE_API_SECRET = "test-api-secret";

export const webhookFixtures = {
  check: {
    body: "TransactionId=3059300327&Amount=1500.00&Currency=RUB&PaymentAmount=1500.00&PaymentCurrency=RUB&DateTime=2026-10-11+09%3a15%3a42&CardId=f1a2b3c4&CardFirstSix=220000&CardLastFour=0004&CardType=MIR&CardExpDate=12%2f30&TestMode=1&Status=Completed&OperationType=Payment&InvoiceId=cm2donation0000000000001&AccountId=donor%40shelter.localhost&SubscriptionId=&TokenRecipient=&Name=IVAN+PETROV&Email=donor%40shelter.localhost&IpAddress=203.0.113.7&IpCountry=RU&IpCity=%d0%9c%d0%be%d1%81%d0%ba%d0%b2%d0%b0&IpRegion=%d0%9c%d0%be%d1%81%d0%ba%d0%b2%d0%b0&IpDistrict=%d0%a6%d0%b5%d0%bd%d1%82%d1%80%d0%b0%d0%bb%d1%8c%d0%bd%d1%8b%d0%b9+%d1%84%d0%b5%d0%b4%d0%b5%d1%80%d0%b0%d0%bb%d1%8c%d0%bd%d1%8b%d0%b9+%d0%be%d0%ba%d1%80%d1%83%d0%b3&IpLatitude=55.75222&IpLongitude=37.61556&Issuer=Sberbank+of+Russia&IssuerBankCountry=RU&Description=%d0%9f%d0%be%d0%b6%d0%b5%d1%80%d1%82%d0%b2%d0%be%d0%b2%d0%b0%d0%bd%d0%b8%d0%b5%3a+%d0%ba%d0%be%d1%80%d0%bc+%d0%bd%d0%b0+%d0%be%d0%ba%d1%82%d1%8f%d0%b1%d1%80%d1%8c&CardProduct=&PaymentMethod=&Data=%7b%22target%22%3a%22NEED%22%2c%22needId%22%3a%22need_korm_oct%22%7d",
    contentHmac: "8zPHwvCzb7geKgpm6dKnujCQX+OPIDNw0yMnujbEjiI=",
  },
  pay: {
    body: "TransactionId=3059300327&Amount=1500.00&Currency=RUB&PaymentAmount=1500.00&PaymentCurrency=RUB&DateTime=2026-10-11+09%3a15%3a42&CardId=f1a2b3c4&CardFirstSix=220000&CardLastFour=0004&CardType=MIR&CardExpDate=12%2f30&TestMode=1&Status=Completed&OperationType=Payment&GatewayName=Test&InvoiceId=cm2donation0000000000001&AccountId=donor%40shelter.localhost&SubscriptionId=&Name=IVAN+PETROV&Email=donor%40shelter.localhost&IpAddress=203.0.113.7&IpCountry=RU&IpCity=%d0%9c%d0%be%d1%81%d0%ba%d0%b2%d0%b0&IpRegion=%d0%9c%d0%be%d1%81%d0%ba%d0%b2%d0%b0&IpDistrict=%d0%a6%d0%b5%d0%bd%d1%82%d1%80%d0%b0%d0%bb%d1%8c%d0%bd%d1%8b%d0%b9+%d1%84%d0%b5%d0%b4%d0%b5%d1%80%d0%b0%d0%bb%d1%8c%d0%bd%d1%8b%d0%b9+%d0%be%d0%ba%d1%80%d1%83%d0%b3&IpLatitude=55.75222&IpLongitude=37.61556&Issuer=Sberbank+of+Russia&IssuerBankCountry=RU&Description=%d0%9f%d0%be%d0%b6%d0%b5%d1%80%d1%82%d0%b2%d0%be%d0%b2%d0%b0%d0%bd%d0%b8%d0%b5%3a+%d0%ba%d0%be%d1%80%d0%bc+%d0%bd%d0%b0+%d0%be%d0%ba%d1%82%d1%8f%d0%b1%d1%80%d1%8c&AuthCode=A1B2C3&Data=%7b%22target%22%3a%22NEED%22%2c%22needId%22%3a%22need_korm_oct%22%7d&Token=tk_0a1b2c3d4e5f&TotalFee=43.50&CardProduct=MIR&PaymentMethod=&FallBackScenarioDeclinedTransactionId=&Rrn=628412345678&VatAboveTotalFee=0&ProcessorAndPartnerFee=0&VatWithinProcessorFee=0",
    contentHmac: "XVW35tWvM7LEDMot19OlTpUS+bf5FUHqVa563ADhNZ4=",
  },
  paySbp: {
    body: "TransactionId=3059300911&Amount=250.50&Currency=RUB&PaymentAmount=250.50&PaymentCurrency=RUB&DateTime=2026-10-11+21%3a03%3a07&CardFirstSix=&CardLastFour=&CardType=&CardExpDate=&TestMode=0&Status=Completed&OperationType=Payment&GatewayName=Sbp&InvoiceId=cm2donation0000000000002&AccountId=&Email=anna%40example.org&Description=%d0%9f%d0%be%d0%b6%d0%b5%d1%80%d1%82%d0%b2%d0%be%d0%b2%d0%b0%d0%bd%d0%b8%d0%b5+%d0%b2+%d0%be%d0%b1%d1%89%d0%b8%d0%b9+%d1%84%d0%be%d0%bd%d0%b4&Data=%7b%22target%22%3a%22GENERAL%22%7d&TotalFee=1.75&PaymentMethod=Sbp&ProcessorAndPartnerFee=1.75&VatWithinProcessorFee=0.29",
    contentHmac: "WxNu1DNNquSOwKTYDFGl+Nrj/4I+qnO2K4Peqj7P3lg=",
  },
  payRecurring: {
    body: "TransactionId=3071188402&Amount=500.00&Currency=RUB&PaymentAmount=500.00&PaymentCurrency=RUB&DateTime=2026-11-11+06%3a00%3a13&CardId=f1a2b3c4&CardFirstSix=220000&CardLastFour=0004&CardType=MIR&CardExpDate=12%2f30&TestMode=1&Status=Completed&OperationType=Payment&GatewayName=Test&InvoiceId=&AccountId=donor%40shelter.localhost&SubscriptionId=sc_8cf8a9338fb8ebf7202b08d09c938&Email=donor%40shelter.localhost&Description=%d0%95%d0%b6%d0%b5%d0%bc%d0%b5%d1%81%d1%8f%d1%87%d0%bd%d0%be%d0%b5+%d0%bf%d0%be%d0%b6%d0%b5%d1%80%d1%82%d0%b2%d0%be%d0%b2%d0%b0%d0%bd%d0%b8%d0%b5&AuthCode=D4E5F6&TotalFee=14.50",
    contentHmac: "GzrNSz+3r8arTh9AfSatG+pftLOtPIiH39Ax5ksezeo=",
  },
  fail: {
    body: "TransactionId=3059300455&Amount=1500.00&Currency=RUB&PaymentAmount=1500.00&PaymentCurrency=RUB&DateTime=2026-10-11+09%3a21%3a05&CardId=f1a2b3c4&CardFirstSix=220000&CardLastFour=0004&CardType=MIR&CardExpDate=12%2f30&TestMode=1&Reason=InsufficientFunds&ReasonCode=5051&OperationType=Payment&InvoiceId=cm2donation0000000000003&AccountId=donor%40shelter.localhost&SubscriptionId=&Name=IVAN+PETROV&Email=donor%40shelter.localhost&IpAddress=203.0.113.7&IpCountry=RU&IpCity=%d0%9c%d0%be%d1%81%d0%ba%d0%b2%d0%b0&IpRegion=%d0%9c%d0%be%d1%81%d0%ba%d0%b2%d0%b0&IpDistrict=%d0%a6%d0%b5%d0%bd%d1%82%d1%80%d0%b0%d0%bb%d1%8c%d0%bd%d1%8b%d0%b9+%d1%84%d0%b5%d0%b4%d0%b5%d1%80%d0%b0%d0%bb%d1%8c%d0%bd%d1%8b%d0%b9+%d0%be%d0%ba%d1%80%d1%83%d0%b3&IpLatitude=55.75222&IpLongitude=37.61556&Issuer=Sberbank+of+Russia&IssuerBankCountry=RU&Description=%d0%9f%d0%be%d0%b6%d0%b5%d1%80%d1%82%d0%b2%d0%be%d0%b2%d0%b0%d0%bd%d0%b8%d0%b5%3a+%d0%ba%d0%be%d1%80%d0%bc+%d0%bd%d0%b0+%d0%be%d0%ba%d1%82%d1%8f%d0%b1%d1%80%d1%8c&Data=%7b%22target%22%3a%22NEED%22%2c%22needId%22%3a%22need_korm_oct%22%7d&Token=&PaymentMethod=&Rrn=",
    contentHmac: "M3bpym5RwdX6Qa+rTrgSO9Q0UV7abygquVysUQ6GLxI=",
  },
  refund: {
    body: "TransactionId=3059411876&PaymentTransactionId=3059300327&Amount=700.00&DateTime=2026-10-12+14%3a02%3a55&OperationType=Refund&InvoiceId=cm2donation0000000000001&AccountId=donor%40shelter.localhost&Email=donor%40shelter.localhost&Data=%7b%22target%22%3a%22NEED%22%2c%22needId%22%3a%22need_korm_oct%22%7d&Rrn=628412345999",
    contentHmac: "DCIJYettuy6ihYlPx+QaQ763lGkNSY+Q9eoqdx/ZaAs=",
  },
  recurrent: {
    body: "Id=sc_8cf8a9338fb8ebf7202b08d09c938&AccountId=donor%40shelter.localhost&Description=%d0%95%d0%b6%d0%b5%d0%bc%d0%b5%d1%81%d1%8f%d1%87%d0%bd%d0%be%d0%b5+%d0%bf%d0%be%d0%b6%d0%b5%d1%80%d1%82%d0%b2%d0%be%d0%b2%d0%b0%d0%bd%d0%b8%d0%b5&Email=donor%40shelter.localhost&Amount=500.00&Currency=RUB&RequireConfirmation=False&StartDate=2026-11-11+06%3a00%3a00&Interval=Month&Period=1&MaxPeriods=&Status=PastDue&SuccessfulTransactionsNumber=3&FailedTransactionsNumber=1&LastTransactionDate=2027-01-11+06%3a00%3a21&NextTransactionDate=2027-01-12+06%3a00%3a00",
    contentHmac: "uc/fpFs1eBBxo3ZkZVd4JdNr5DgkLWT9uJEVCeo1aso=",
  },
} as const;
