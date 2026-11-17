package com.schoolerp.inventory.model;

import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class AuditEntry {
    private LocalDateTime at;
    private String by;
    private String action;
    private String details;

    public static AuditEntry of(String by, String action, String details) {
        return new AuditEntry(LocalDateTime.now(), by, action, details);
    }
}
