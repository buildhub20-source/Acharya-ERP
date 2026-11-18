package com.schoolerp.inventory.messaging;

/** Phone helpers. Vendors are Indian, so numbers are compared on their last 10 digits. */
public final class PhoneNumbers {
    private PhoneNumbers() {}

    public static String digits(String raw) {
        return raw == null ? "" : raw.replaceAll("\\D", "");
    }

    /** E.164 without the plus, e.g. 9840012345 -> 919840012345 (the format WhatsApp Cloud API wants). */
    public static String international(String raw) {
        String d = digits(raw);
        if (d.length() == 10) return "91" + d;
        if (d.length() == 11 && d.startsWith("0")) return "91" + d.substring(1);
        return d;
    }

    public static String e164(String raw) {
        String d = international(raw);
        return d.isEmpty() ? "" : "+" + d;
    }

    public static boolean same(String a, String b) {
        String x = digits(a), y = digits(b);
        if (x.length() < 10 || y.length() < 10) return false;
        return x.substring(x.length() - 10).equals(y.substring(y.length() - 10));
    }
}
