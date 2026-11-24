package com.schoolerp.inventory.repository;

import jakarta.annotation.PostConstruct;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Function;
import java.util.function.Predicate;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Thread-safe in-memory store. When a {@link DocumentStore} (Supabase) is configured it acts as a
 * write-through cache: rows are loaded once at startup and every save/delete is written to Postgres.
 * Services therefore must call {@code save()} after changing an entity, which they already do.
 */
public abstract class InMemoryRepository<T> {

    private final Map<String, T> store = new ConcurrentHashMap<>();
    private final AtomicLong sequence = new AtomicLong(1000);
    private final Function<T, String> idOf;
    private final String idPrefix;
    private final Class<T> type;
    private DocumentStore db;

    protected InMemoryRepository(String idPrefix, Function<T, String> idOf, Class<T> type) {
        this.idPrefix = idPrefix;
        this.idOf = idOf;
        this.type = type;
    }

    @Autowired(required = false)
    void setDocumentStore(DocumentStore db) {
        this.db = db;
    }

    @PostConstruct
    void loadFromDatabase() {
        if (db == null) return;
        for (T entity : db.loadAll(idPrefix, type)) {
            String id = idOf.apply(entity);
            store.put(id, entity);
            bumpSequencePast(id);
        }
    }

    /** Keeps generated ids unique across restarts: "VEN-1042" moves the counter to at least 1042. */
    private void bumpSequencePast(String id) {
        String prefix = idPrefix + "-";
        if (id == null || !id.startsWith(prefix)) return;
        try {
            long n = Long.parseLong(id.substring(prefix.length()));
            sequence.accumulateAndGet(n, Math::max);
        } catch (NumberFormatException ignored) {
            // hand-picked ids such as category "footwear" do not affect the counter
        }
    }

    public boolean isPersistent() {
        return db != null;
    }

    public String nextId() {
        return idPrefix + "-" + sequence.incrementAndGet();
    }

    public long nextSequence() {
        return sequence.get() + 1;
    }

    public T save(T entity) {
        String id = idOf.apply(entity);
        if (db != null) db.upsert(idPrefix, id, entity);
        store.put(id, entity);
        return entity;
    }

    public Optional<T> findById(String id) {
        return Optional.ofNullable(id == null ? null : store.get(id));
    }

    public List<T> findAll() {
        return new ArrayList<>(store.values());
    }

    public List<T> findWhere(Predicate<T> filter) {
        return store.values().stream().filter(filter).toList();
    }

    public void deleteById(String id) {
        if (db != null) db.delete(idPrefix, id);
        store.remove(id);
    }

    public long count() {
        return store.size();
    }
}
