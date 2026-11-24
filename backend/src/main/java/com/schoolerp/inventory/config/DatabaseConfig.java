package com.schoolerp.inventory.config;

import com.schoolerp.inventory.repository.DocumentStore;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Connects to Supabase Postgres when SUPABASE_DB_URL is set. Without it the app keeps running on
 * in-memory mock data, exactly as before.
 */
@Configuration
@ConditionalOnExpression("!'${app.db.url:}'.isBlank()")
public class DatabaseConfig {

    @Bean(destroyMethod = "close")
    public HikariDataSource dataSource(@Value("${app.db.url}") String url,
                                       @Value("${app.db.username:}") String username,
                                       @Value("${app.db.password:}") String password,
                                       @Value("${app.db.pool-size:5}") int poolSize) {
        Connection c = Connection.parse(url, username, password);
        HikariConfig cfg = new HikariConfig();
        cfg.setJdbcUrl(c.jdbcUrl());
        if (!c.username().isBlank()) cfg.setUsername(c.username());
        if (!c.password().isBlank()) cfg.setPassword(c.password());
        // Supabase's free tier caps pooler connections; a small pool is plenty for this app.
        cfg.setMaximumPoolSize(poolSize);
        cfg.setPoolName("supabase");
        return new HikariDataSource(cfg);
    }

    @Bean
    public DocumentStore documentStore(HikariDataSource dataSource) {
        return new DocumentStore(dataSource);
    }

    /**
     * Accepts either a JDBC URL or the URI Supabase shows on its Connect page
     * ({@code postgresql://user:password@host:5432/postgres}). Credentials in the URI win over the separate
     * settings, and are moved out of the URL so a connection error can never print the password.
     */
    record Connection(String jdbcUrl, String username, String password) {

        static Connection parse(String url, String username, String password) {
            String u = url.trim();
            if (u.startsWith("jdbc:")) return new Connection(u, username, password);
            if (!u.startsWith("postgresql://") && !u.startsWith("postgres://")) {
                throw new IllegalArgumentException(
                        "SUPABASE_DB_URL must start with jdbc:postgresql:// or postgresql:// (see backend/.env.example)");
            }
            // Split "user:password@" off by hand: the password may hold characters java.net.URI rejects ([, #, /).
            String rest = u.substring(u.indexOf("://") + 3);
            int at = rest.lastIndexOf('@');
            String info = at < 0 ? null : rest.substring(0, at);
            URI uri = URI.create("postgresql://" + rest.substring(at + 1));
            String user = username;
            String pass = password;
            if (info != null) {
                int colon = info.indexOf(':');
                user = decode(colon < 0 ? info : info.substring(0, colon));
                if (colon >= 0) pass = decode(stripBrackets(info.substring(colon + 1)));
            }
            int port = uri.getPort() > 0 ? uri.getPort() : 5432;
            String db = uri.getPath() == null || uri.getPath().length() <= 1 ? "/postgres" : uri.getPath();
            String query = uri.getRawQuery() == null ? "sslmode=require" : uri.getRawQuery();
            if (!query.contains("sslmode=")) query += "&sslmode=require";
            return new Connection("jdbc:postgresql://" + uri.getHost() + ":" + port + db + "?" + query, user, pass);
        }

        /** Supabase's template shows "[YOUR-PASSWORD]"; people often keep the brackets when pasting. */
        private static String stripBrackets(String s) {
            return s.length() > 1 && s.startsWith("[") && s.endsWith("]") ? s.substring(1, s.length() - 1) : s;
        }

        private static String decode(String s) {
            return URLDecoder.decode(s.replace("+", "%2B"), StandardCharsets.UTF_8);
        }

        @Override
        public String toString() {
            return "Connection[" + jdbcUrl + ", user=" + username + "]";
        }
    }
}
