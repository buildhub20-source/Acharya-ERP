package com.schoolerp.inventory.model;

import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/** A requested change to a vendor's legal identity; applied only after approver sign-off. */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class IdentityChange {
    private String legalName;
    private String gstin;
    private String pan;
    private String reason;
    private String requestedBy;
    private LocalDateTime requestedAt;
}
