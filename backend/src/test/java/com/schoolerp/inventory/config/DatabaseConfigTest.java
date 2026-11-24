package com.schoolerp.inventory.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import com.schoolerp.inventory.config.DatabaseConfig.Connection;
import org.junit.jupiter.api.Test;

class DatabaseConfigTest {

    @Test
    void supabaseUriIsConvertedAndCredentialsMovedOutOfUrl() {
        Connection c = Connection.parse(
                "postgresql://postgres.abc:p%23ss%2Bw0rd@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres",
                "", "");
        assertEquals("jdbc:postgresql://aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres?sslmode=require",
                c.jdbcUrl());
        assertEquals("postgres.abc", c.username());
        assertEquals("p#ss+w0rd", c.password());
        assertFalse(c.toString().contains("w0rd"), "password must never be printed");
    }

    @Test
    void bracketsFromSupabaseTemplateAreStripped() {
        Connection c = Connection.parse("postgresql://postgres.abc:[secret]@host.example:6543/postgres", "", "");
        assertEquals("secret", c.password());
        assertEquals("jdbc:postgresql://host.example:6543/postgres?sslmode=require", c.jdbcUrl());
    }

    @Test
    void jdbcUrlKeepsSeparateCredentials() {
        Connection c = Connection.parse("jdbc:postgresql://h:5432/postgres?sslmode=require", "postgres.abc", "pw");
        assertEquals("jdbc:postgresql://h:5432/postgres?sslmode=require", c.jdbcUrl());
        assertEquals("postgres.abc", c.username());
        assertEquals("pw", c.password());
    }
}
