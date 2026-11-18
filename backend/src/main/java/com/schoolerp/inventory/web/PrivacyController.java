package com.schoolerp.inventory.web;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.HtmlUtils;

/**
 * Public privacy policy and data-deletion instructions. Meta requires both URLs before a WhatsApp app can be
 * published. It is the only non-webhook path the ngrok traffic policy lets through.
 */
@RestController
public class PrivacyController {

    private final String page;

    public PrivacyController(@Value("${app.school-name:School}") String schoolName) {
        this.page = TEMPLATE.replace("{{SCHOOL}}", HtmlUtils.htmlEscape(schoolName));
    }

    @GetMapping(value = "/privacy", produces = MediaType.TEXT_HTML_VALUE)
    public String privacy() {
        return page;
    }

    private static final String TEMPLATE = """
            <!doctype html>
            <html lang="en">
            <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Privacy Policy - {{SCHOOL}} Procurement</title>
            <style>
              body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; max-width: 760px;
                     margin: 0 auto; padding: 32px 16px; line-height: 1.6; color: #1f2937; background: #fff; }
              h1 { font-size: 1.6rem; margin-bottom: 0.25rem; }
              h2 { font-size: 1.15rem; margin-top: 2rem; }
              .muted { color: #6b7280; font-size: 0.9rem; }
            </style>
            </head>
            <body>
            <h1>Privacy Policy</h1>
            <p class="muted">{{SCHOOL}} &middot; Vendor procurement messaging &middot; Last updated 18 November 2026</p>

            <p>{{SCHOOL}} uses an internal procurement system to request quotations from suppliers and to place
            purchase orders. This policy explains what information that system handles when it contacts suppliers
            by email, WhatsApp or SMS, and how suppliers can have their information removed.</p>

            <h2>Who this applies to</h2>
            <p>Businesses and their contact persons who supply goods or services to the school ("vendors").
            The system does not message students, parents or the general public.</p>

            <h2>Information we handle</h2>
            <ul>
              <li><strong>Vendor contact details</strong> that the vendor gave the school: business name, contact person,
                  email address, phone and WhatsApp number, and the preferred way to be contacted.</li>
              <li><strong>Messages</strong> exchanged about requests for quotation and purchase orders, including any
                  prices, delivery terms and attachments (such as PDF quotations) the vendor sends.</li>
              <li><strong>Delivery information</strong> from the messaging provider, such as whether a message was
                  delivered or read.</li>
            </ul>

            <h2>How we use it</h2>
            <p>Only to run the school's purchasing: sending requests for quotation, recording and comparing the quotes
            received, notifying the selected vendor, and keeping purchase records. We do not use it for advertising,
            and we do not sell or rent it to anyone.</p>

            <h2>Service providers</h2>
            <p>Messages are carried by the provider of the channel the vendor chose: Google (Gmail) for email,
            Meta (WhatsApp Business Platform) for WhatsApp, and an SMS gateway for text messages. Each provider
            processes the message under its own terms and privacy policy, only to deliver it.</p>

            <h2>Retention</h2>
            <p>Quotations and purchase records are kept as long as the school needs them for its accounts and audits.
            Contact details are kept while the vendor remains on the school's supplier list.</p>

            <h2 id="data-deletion">Removing your data</h2>
            <p>To stop receiving messages or to have your contact details and messages deleted, reply
            <strong>STOP</strong> or <strong>DELETE MY DATA</strong> on the same channel the school contacted you on
            (the same email thread or WhatsApp chat), or tell the school's purchase office. We will remove your
            contact details from the supplier list and delete your messages, except records the school is required
            by law to keep for its accounts.</p>

            <h2>Changes</h2>
            <p>If this policy changes, the updated version will be published at this address.</p>
            </body>
            </html>
            """;
}
