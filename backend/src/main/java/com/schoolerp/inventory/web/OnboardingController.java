package com.schoolerp.inventory.web;

import com.schoolerp.inventory.model.Category;
import com.schoolerp.inventory.service.OnboardingService;
import com.schoolerp.inventory.service.VendorService;
import com.schoolerp.inventory.web.dto.Dtos.DocumentRequest;
import com.schoolerp.inventory.web.dto.Dtos.VendorRequest;
import com.schoolerp.inventory.web.dto.VendorDtos.InviteLink;
import com.schoolerp.inventory.web.dto.VendorDtos.OnboardingView;
import com.schoolerp.inventory.web.dto.VendorDtos.OtpRequest;
import com.schoolerp.inventory.web.dto.VendorDtos.OtpSent;
import com.schoolerp.inventory.web.dto.VendorDtos.OtpVerify;
import com.schoolerp.inventory.web.dto.VendorDtos.SelfRegistration;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Public, token-protected endpoints used by vendors to register and complete their profile. */
@RestController
@RequestMapping("/api/portal")
public class OnboardingController {

    private final OnboardingService onboarding;
    private final VendorService vendors;

    public OnboardingController(OnboardingService onboarding, VendorService vendors) {
        this.onboarding = onboarding;
        this.vendors = vendors;
    }

    @GetMapping("/categories")
    public List<Category> categories() {
        return vendors.categories();
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public InviteLink register(@Valid @RequestBody SelfRegistration req) {
        return onboarding.selfRegister(req);
    }

    @GetMapping("/onboarding/{token}")
    public OnboardingView view(@PathVariable String token) {
        return onboarding.view(token);
    }

    @PutMapping("/onboarding/{token}")
    public OnboardingView save(@PathVariable String token, @Valid @RequestBody VendorRequest req) {
        return onboarding.save(token, req);
    }

    @PostMapping("/onboarding/{token}/documents")
    public OnboardingView addDocument(@PathVariable String token, @Valid @RequestBody DocumentRequest req) {
        return onboarding.addDocument(token, req);
    }

    @DeleteMapping("/onboarding/{token}/documents/{docId}")
    public OnboardingView removeDocument(@PathVariable String token, @PathVariable String docId) {
        return onboarding.removeDocument(token, docId);
    }

    @PostMapping("/onboarding/{token}/otp")
    public OtpSent sendOtp(@PathVariable String token, @Valid @RequestBody OtpRequest req) {
        return onboarding.sendOtp(token, req.contactIndex(), req.channel());
    }

    @PostMapping("/onboarding/{token}/otp/verify")
    public OnboardingView verifyOtp(@PathVariable String token, @Valid @RequestBody OtpVerify req) {
        return onboarding.verifyOtp(token, req.contactIndex(), req.channel(), req.code());
    }

    @PostMapping("/onboarding/{token}/submit")
    public OnboardingView submit(@PathVariable String token) {
        return onboarding.submit(token);
    }
}
