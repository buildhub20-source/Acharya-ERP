package com.schoolerp.inventory.repository;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.schoolerp.inventory.model.BankDetails;
import com.schoolerp.inventory.model.ContactPerson;
import com.schoolerp.inventory.model.Enums;
import com.schoolerp.inventory.model.Vendor;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;

/** The JSON written to Supabase must round-trip every field, including ones hidden from the API. */
class DocumentStoreMappingTest {

    @Test
    void vendorRoundTripsThroughStoredJson() {
        Vendor v = new Vendor();
        v.setId("VEN-1042");
        v.setLegalName("Acme Supplies Pvt Ltd");
        v.setStatus(Enums.VendorStatus.ACTIVE);
        v.setPortalEnabled(true);
        v.setCreatedAt(LocalDateTime.of(2026, 11, 24, 10, 30));
        v.getContacts().add(new ContactPerson());
        v.getOptedOutChannels().add(Enums.Channel.values()[0]);
        v.setBank(new BankDetails("Acme", "123456789012", "HDFC0001234", "HDFC", true));

        String json = DocumentStore.mapper.writeValueAsString(v);
        Vendor back = DocumentStore.mapper.readValue(json, Vendor.class);

        assertEquals("123456789012", back.getBank().getAccountNumber(), "bank account number must be persisted");
        assertFalse(json.contains("displayName"), "derived getters must not be stored");
        assertFalse(json.contains("maskedAccountNumber"), "derived getters must not be stored");
        assertEquals(v, back);
        assertTrue(back.isPortalEnabled());
    }
}
