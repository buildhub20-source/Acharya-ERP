package com.schoolerp.inventory.service;

import com.schoolerp.inventory.model.Enums.QuoteSource;
import com.schoolerp.inventory.model.Quote;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

/**
 * Mock "parse responses" step. Pulls structured fields out of free text using
 * simple patterns. In production, PDF/image go through OCR, voice through
 * speech-to-text, and the resulting text through an LLM extractor; the output
 * contract (fields + confidence) stays the same.
 */
@Service
public class QuoteParserService {

    private static final Pattern PRICE = Pattern.compile(
            "(?:\\brs\\.?|\\binr|₹|\\bprice|\\brate)\\s*[:\\-]?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern TAX = Pattern.compile(
            "(?:gst|tax)\\s*(?:@|:|-)?\\s*([0-9]{1,2}(?:\\.[0-9])?)\\s*%|([0-9]{1,2})\\s*%\\s*(?:gst|tax)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern DELIVERY_DAYS = Pattern.compile(
            "([0-9]{1,3})\\s*(?:working\\s*)?days?", Pattern.CASE_INSENSITIVE);
    private static final Pattern DELIVERY_CHARGE = Pattern.compile(
            "(?:delivery|transport|freight|shipping)\\s*(?:charges?|cost)?\\s*(?:rs\\.?|₹|:|-)?\\s*([0-9][0-9,]*)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern FREE_DELIVERY = Pattern.compile(
            "free\\s*(?:delivery|shipping|transport)", Pattern.CASE_INSENSITIVE);
    private static final Pattern VALIDITY = Pattern.compile(
            "valid(?:ity)?\\s*(?:for|:)?\\s*([0-9]{1,3})\\s*days?", Pattern.CASE_INSENSITIVE);
    private static final Pattern TERMS = Pattern.compile(
            "(advance|net\\s*15|net\\s*30|15\\s*days\\s*credit|30\\s*days\\s*credit|cod)", Pattern.CASE_INSENSITIVE);

    public Quote parse(String rawText, QuoteSource source, int quantity) {
        Quote q = new Quote();
        q.setSource(source);
        q.setRawText(rawText);
        q.setQuantity(quantity);
        List<String> missing = new ArrayList<>();
        String text = rawText == null ? "" : rawText;

        BigDecimal price = firstNumber(PRICE, text);
        if (price != null) q.setUnitPrice(price); else missing.add("unitPrice");

        Matcher tax = TAX.matcher(text);
        if (tax.find()) {
            String g = tax.group(1) != null ? tax.group(1) : tax.group(2);
            q.setTaxPercent(new BigDecimal(g));
        } else {
            q.setTaxPercent(new BigDecimal("12"));   // footwear/uniform default; flag it
            missing.add("taxPercent");
        }

        if (FREE_DELIVERY.matcher(text).find()) {
            q.setDeliveryCharge(BigDecimal.ZERO);
        } else {
            BigDecimal dc = firstNumber(DELIVERY_CHARGE, text);
            q.setDeliveryCharge(dc == null ? BigDecimal.ZERO : dc);
            if (dc == null) missing.add("deliveryCharge");
        }

        Matcher validity = VALIDITY.matcher(text);
        Integer validityDays = null;
        if (validity.find()) validityDays = Integer.parseInt(validity.group(1));
        q.setValidityDays(validityDays == null ? 15 : validityDays);
        if (validityDays == null) missing.add("validityDays");

        // Delivery days: first "N days" that is not the validity figure.
        Matcher dd = DELIVERY_DAYS.matcher(text);
        Integer days = null;
        while (dd.find()) {
            int n = Integer.parseInt(dd.group(1));
            if (validityDays != null && n == validityDays) continue;
            String before = text.substring(Math.max(0, dd.start() - 12), dd.start()).toLowerCase(Locale.ROOT);
            if (before.contains("valid") || before.contains("credit") || before.contains("net")) continue;
            days = n;
            break;
        }
        if (days != null) q.setDeliveryDays(days); else { q.setDeliveryDays(7); missing.add("deliveryDays"); }

        Matcher terms = TERMS.matcher(text);
        q.setPaymentTerms(terms.find() ? normaliseTerms(terms.group(1)) : null);

        // Confidence: start from how reliable the source is, minus missing fields.
        double base = switch (source) {
            case PORTAL, MANUAL -> 1.0;
            case EMAIL_TEXT, WHATSAPP_TEXT, SMS_TEXT -> 0.95;
            case PDF -> 0.9;
            case IMAGE -> 0.75;
            case VOICE -> 0.7;
        };
        double confidence = base - missing.size() * 0.1 - (missing.contains("unitPrice") ? 0.3 : 0);
        q.setParseConfidence(Math.max(0.1, Math.round(confidence * 100) / 100.0));
        q.setLowConfidenceFields(missing);
        if (q.getUnitPrice() == null) q.setUnitPrice(BigDecimal.ZERO);
        return q;
    }

    private BigDecimal firstNumber(Pattern p, String text) {
        Matcher m = p.matcher(text);
        if (!m.find()) return null;
        try {
            return new BigDecimal(m.group(1).replace(",", ""));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String normaliseTerms(String raw) {
        String s = raw.toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
        if (s.startsWith("advance")) return "ADVANCE";
        if (s.equals("cod")) return "COD";
        if (s.contains("15")) return "NET_15";
        if (s.contains("30")) return "NET_30";
        return raw.toUpperCase(Locale.ROOT);
    }
}
