package com.schoolerp.inventory.messaging;

import com.schoolerp.inventory.model.Enums.Channel;
import com.schoolerp.inventory.model.Enums.QuoteSource;
import com.schoolerp.inventory.model.MessageLog;
import com.schoolerp.inventory.service.MessagingService;
import com.schoolerp.inventory.web.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Channel settings page: which providers are live, send a test, and simulate a vendor reply. */
@RestController
@RequestMapping("/api/channels")
public class ChannelController {

    private final MessagingService messaging;
    private final InboundReplyService inbound;

    public ChannelController(MessagingService messaging, InboundReplyService inbound) {
        this.messaging = messaging;
        this.inbound = inbound;
    }

    public record TestSend(@NotNull Channel channel, @NotBlank String to, @NotBlank String message) {}

    /** A reply exactly as it would arrive from IMAP / a webhook, for testing without a public URL. */
    public record SimulatedReply(@NotNull Channel channel, @NotBlank String from, String subject, @NotBlank String text) {}

    @GetMapping
    public List<Map<String, Object>> status() {
        return messaging.channelStatus();
    }

    @PostMapping("/test")
    public MessageLog test(@Valid @RequestBody TestSend req) {
        if (req.channel() == Channel.PORTAL) throw ApiException.badRequest("Portal has no external delivery to test");
        return messaging.sendTest(req.channel(), req.to(), req.message());
    }

    @PostMapping("/simulate-inbound")
    public MessageLog simulate(@Valid @RequestBody SimulatedReply req) {
        if (req.channel() == Channel.PORTAL) throw ApiException.badRequest("Portal quotes are submitted on the portal");
        QuoteSource src = switch (req.channel()) { case EMAIL -> QuoteSource.EMAIL_TEXT; case SMS -> QuoteSource.SMS_TEXT; default -> QuoteSource.WHATSAPP_TEXT; };
        return inbound.handle(req.channel(), req.from(), req.subject(), req.text(), src, null, null);
    }
}
