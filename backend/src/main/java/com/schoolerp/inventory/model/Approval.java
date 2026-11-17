package com.schoolerp.inventory.model;

import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class Approval {
    private Enums.ApprovalLevel level;
    private String approver;
    private Enums.ApprovalDecision decision;
    private String vendorId;
    private String comments;
    private LocalDateTime at;
}
