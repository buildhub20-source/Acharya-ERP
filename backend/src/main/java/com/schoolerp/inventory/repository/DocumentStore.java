package com.schoolerp.inventory.repository;

import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.PropertyAccessor;
import com.schoolerp.inventory.model.BankDetails;
import java.util.List;
import javax.sql.DataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Persists every entity as one JSONB row in Postgres (Supabase): {@code erp_documents(collection, id, data)}.
 * The in-memory repositories use it as a write-through store: load everything at startup, upsert on save.
 */
public class DocumentStore {

    private final JdbcTemplate jdbc;

    /**
     * Separate from the web mapper on purpose: it reads and writes fields, not getters (so derived values like
     * {@code Vendor.displayName} are not stored), and it keeps fields hidden from the API such as the bank account number.
     */
    static final ObjectMapper mapper = JsonMapper.builder()
            .changeDefaultVisibility(v -> v
                    .withVisibility(PropertyAccessor.ALL, JsonAutoDetect.Visibility.NONE)
                    .withVisibility(PropertyAccessor.FIELD, JsonAutoDetect.Visibility.ANY))
            .addMixIn(BankDetails.class, BankDetailsStorageMixin.class)
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .build();

    public DocumentStore(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
        ensureSchema();
    }

    private void ensureSchema() {
        jdbc.execute("""
                create table if not exists erp_documents (
                    collection text not null,
                    id         text not null,
                    data       jsonb not null,
                    updated_at timestamptz not null default now(),
                    primary key (collection, id)
                )""");
        // Supabase exposes public tables over its REST API; RLS with no policies keeps this table server-only.
        // The backend connects as the postgres role, which bypasses RLS.
        jdbc.execute("alter table erp_documents enable row level security");
    }

    public <T> List<T> loadAll(String collection, Class<T> type) {
        return jdbc.query("select data::text from erp_documents where collection = ?",
                (rs, i) -> mapper.readValue(rs.getString(1), type), collection);
    }

    public void upsert(String collection, String id, Object entity) {
        jdbc.update("""
                insert into erp_documents (collection, id, data, updated_at) values (?, ?, ?::jsonb, now())
                on conflict (collection, id) do update set data = excluded.data, updated_at = now()""",
                collection, id, mapper.writeValueAsString(entity));
    }

    public void delete(String collection, String id) {
        jdbc.update("delete from erp_documents where collection = ? and id = ?", collection, id);
    }

    /** Re-includes the account number that {@link BankDetails} hides from API responses. */
    abstract static class BankDetailsStorageMixin {
        @JsonIgnore(false)
        private String accountNumber;
    }
}
