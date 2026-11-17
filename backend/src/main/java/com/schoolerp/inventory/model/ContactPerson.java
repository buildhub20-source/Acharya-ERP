package com.schoolerp.inventory.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ContactPerson {
    private String name;
    private String role;
    private String phone;
    private String whatsapp;
    private String email;
    private Enums.Channel preferredChannel;
    private boolean phoneVerified;
    private boolean emailVerified;
}
