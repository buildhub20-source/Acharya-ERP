package com.schoolerp.inventory.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class BankDetails {
    private String accountName;
    /** Never serialised to clients; only the masked form leaves the server. */
    @JsonIgnore
    private String accountNumber;
    private String ifsc;
    private String bankName;
    private boolean verified;

    public String getMaskedAccountNumber() {
        if (accountNumber == null || accountNumber.length() < 4) return "****";
        return "****" + accountNumber.substring(accountNumber.length() - 4);
    }
}
