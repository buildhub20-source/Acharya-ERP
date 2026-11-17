package com.schoolerp.inventory.repository;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Function;
import java.util.function.Predicate;

/**
 * Thread-safe in-memory store used while the project runs on mock data.
 * Each concrete repository exposes the same small surface that a Supabase/JPA
 * implementation will provide later, so services do not need to change.
 */
public abstract class InMemoryRepository<T> {

    private final Map<String, T> store = new ConcurrentHashMap<>();
    private final AtomicLong sequence = new AtomicLong(1000);
    private final Function<T, String> idOf;
    private final String idPrefix;

    protected InMemoryRepository(String idPrefix, Function<T, String> idOf) {
        this.idPrefix = idPrefix;
        this.idOf = idOf;
    }

    public String nextId() {
        return idPrefix + "-" + sequence.incrementAndGet();
    }

    public long nextSequence() {
        return sequence.get() + 1;
    }

    public T save(T entity) {
        store.put(idOf.apply(entity), entity);
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
        store.remove(id);
    }

    public long count() {
        return store.size();
    }
}
