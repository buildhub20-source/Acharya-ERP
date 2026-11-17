package com.schoolerp.inventory.service;

import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** "No reply? Auto reminder" loop from the process diagram. */
@Component
public class ReminderScheduler {

    private static final Logger log = LoggerFactory.getLogger(ReminderScheduler.class);

    private final ProcurementService procurement;

    @Value("${app.rfq.reminder-interval-hours:24}")
    private long intervalHours;

    public ReminderScheduler(ProcurementService procurement) {
        this.procurement = procurement;
    }

    @Scheduled(fixedDelayString = "${app.rfq.reminder-sweep-ms:600000}", initialDelay = 60000)
    public void sweep() {
        int sent = procurement.runReminderSweep(Duration.ofHours(intervalHours));
        if (sent > 0) log.info("Auto-reminder sweep sent {} reminder(s)", sent);
    }
}
