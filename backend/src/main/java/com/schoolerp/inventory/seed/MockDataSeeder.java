package com.schoolerp.inventory.seed;

import com.schoolerp.inventory.model.AuditEntry;
import com.schoolerp.inventory.model.BankDetails;
import com.schoolerp.inventory.model.Category;
import com.schoolerp.inventory.model.ContactPerson;
import com.schoolerp.inventory.model.Enums.Channel;
import com.schoolerp.inventory.model.Enums.DocVerification;
import com.schoolerp.inventory.model.Enums.QuoteSource;
import com.schoolerp.inventory.model.Enums.VendorStatus;
import com.schoolerp.inventory.model.Enums.VendorType;
import com.schoolerp.inventory.model.Item;
import com.schoolerp.inventory.model.PrLine;
import com.schoolerp.inventory.model.PurchaseRequest;
import com.schoolerp.inventory.model.Rfq;
import com.schoolerp.inventory.model.Vendor;
import com.schoolerp.inventory.model.VendorDocument;
import com.schoolerp.inventory.model.VendorPerformance;
import com.schoolerp.inventory.repository.Repositories.CategoryRepository;
import com.schoolerp.inventory.repository.Repositories.ItemRepository;
import com.schoolerp.inventory.repository.Repositories.RfqRepository;
import com.schoolerp.inventory.repository.Repositories.VendorRepository;
import com.schoolerp.inventory.service.InventoryService;
import com.schoolerp.inventory.service.ProcurementService;
import com.schoolerp.inventory.service.VendorService;
import com.schoolerp.inventory.web.dto.Dtos.ManagerReviewRequest;
import com.schoolerp.inventory.web.dto.Dtos.OfficialDecisionRequest;
import com.schoolerp.inventory.web.dto.Dtos.PurchaseRequestCreate;
import com.schoolerp.inventory.web.dto.Dtos.QuoteSubmission;
import com.schoolerp.inventory.web.dto.Dtos.RawReplyRequest;
import com.schoolerp.inventory.web.dto.Dtos.SendRfqRequest;
import com.schoolerp.inventory.web.dto.InventoryDtos.AdjustmentRequest;
import com.schoolerp.inventory.web.dto.InventoryDtos.GrnRequest;
import com.schoolerp.inventory.web.dto.InventoryDtos.IssueRequest;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

/**
 * Seeds realistic mock data on startup. Purchase requests are driven through the
 * real service methods so every record is in a consistent workflow state.
 * Delete this class once the app is backed by Supabase.
 */
@Component
public class MockDataSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(MockDataSeeder.class);

    private final CategoryRepository categories;
    private final ItemRepository items;
    private final VendorRepository vendors;
    private final RfqRepository rfqs;
    private final VendorService vendorService;
    private final ProcurementService procurement;
    private final InventoryService inventory;

    public MockDataSeeder(CategoryRepository categories, ItemRepository items, VendorRepository vendors,
                          RfqRepository rfqs, VendorService vendorService, ProcurementService procurement,
                          InventoryService inventory) {
        this.categories = categories;
        this.items = items;
        this.vendors = vendors;
        this.rfqs = rfqs;
        this.vendorService = vendorService;
        this.procurement = procurement;
        this.inventory = inventory;
    }

    @Override
    public void run(String... args) {
        // With Supabase connected, seed only an empty database; after that the stored data is the truth.
        if (vendors.isPersistent() && vendors.count() > 0) {
            log.info("Supabase data loaded: {} categories, {} items, {} vendors, {} purchase requests (mock seeding skipped)",
                    categories.count(), items.count(), vendors.count(), procurement.list(null).size());
            return;
        }
        seedCategories();
        seedItems();
        seedStock();
        seedVendors();
        vendorService.refreshCompliance();
        seedPurchaseRequests();
        log.info("Mock data loaded: {} categories, {} items, {} vendors, {} purchase requests",
                categories.count(), items.count(), vendors.count(), procurement.list(null).size());
    }

    // ------------------------------------------------------------------ masters

    private void seedCategories() {
        cat("footwear", "Footwear", "School shoes, sports shoes, socks");
        cat("uniforms", "Uniforms", "Shirts, trousers, skirts, blazers, ties");
        cat("stationery", "Stationery", "Notebooks, pens, chart paper, printing");
        cat("lab", "Lab Equipment", "Science lab glassware, chemicals, models");
        cat("sports", "Sports Goods", "Balls, nets, kits, athletics equipment");
        cat("it", "IT & Electronics", "Computers, projectors, networking");
        cat("furniture", "Furniture", "Desks, benches, chairs, cupboards");
        cat("housekeeping", "Housekeeping", "Cleaning supplies, consumables");
        cat("canteen", "Canteen & Food", "Groceries, food supplies");
    }

    private void cat(String id, String name, String desc) {
        categories.save(new Category(id, name, desc));
    }

    private void seedItems() {
        item("ITM-1", "FW-SPT-WHT", "Sports shoes (white)", "footwear", "pair", "780", 10, 20, "Sports room, Rack S1");
        item("ITM-2", "FW-SCH-BLK", "School shoes (black, leather)", "footwear", "pair", "950", 15, 30, "Main store, Rack F2");
        item("ITM-3", "UN-SHT-WHT", "Shirt, white, half sleeve", "uniforms", "pc", "320", 40, 100, "Uniform store, Rack U1");
        item("ITM-4", "UN-TRS-NVY", "Trouser, navy blue", "uniforms", "pc", "450", 30, 80, "Uniform store, Rack U2");
        item("ITM-5", "ST-NBK-200", "Notebook, 200 pages, ruled", "stationery", "pc", "42", 100, 300, "Main store, Rack A1");
        item("ITM-6", "ST-A4-RM", "A4 paper ream, 75 GSM", "stationery", "ream", "280", 20, 50, "Main store, Rack A3");
        item("ITM-7", "LB-BKR-250", "Borosilicate beaker 250 ml", "lab", "pc", "95", 24, 60, "Chemistry lab store");
        item("ITM-8", "LB-TT-SET", "Test tube set with stand", "lab", "set", "420", 10, 40, "Chemistry lab store");
        item("ITM-9", "FN-DSK-DBL", "Dual student desk with bench", "furniture", "pc", "5200", 0, 0, "Furniture godown");
        item("ITM-10", "SP-FB-5", "Football, size 5", "sports", "pc", "650", 6, 12, "Sports room, Rack S2");
        item("ITM-11", "ST-CHK-WHT", "White chalk, box of 100", "stationery", "box", "55", 30, 60, "Main store, Rack A2");
        item("ITM-12", "HK-FLR-5L", "Floor cleaner, 5 litre can", "housekeeping", "can", "340", 8, 20, "Housekeeping store");
    }

    private void item(String id, String sku, String name, String cat, String unit, String price,
                      int reorderLevel, int reorderQty, String location) {
        Item i = Item.of(id, sku, name, cat, unit, new BigDecimal(price));
        i.setReorderLevel(reorderLevel);
        i.setReorderQuantity(reorderQty);
        i.setLocation(location);
        items.save(i);
    }

    /** Opening balances + a few weeks of issues so the ledger and reorder alerts have something to show. */
    private void seedStock() {
        String by = "Mr. Selvam (Store Keeper)";
        opening("ITM-1", 6, by); opening("ITM-2", 42, by); opening("ITM-3", 160, by); opening("ITM-4", 95, by);
        opening("ITM-5", 40, by); opening("ITM-6", 34, by); opening("ITM-7", 70, by); opening("ITM-8", 14, by);
        opening("ITM-10", 3, by); opening("ITM-11", 85, by); opening("ITM-12", 7, by);

        issue("ITM-6", 14, "Administration", "Office", "Exam paper printing", by);
        issue("ITM-3", 38, "Admissions", "New Grade 1 students", "Uniform kits for new admissions", by);
        issue("ITM-11", 25, "Academics - Primary", "Grades 1-5", "Monthly chalk supply", by);
        issue("ITM-8", 4, "Science Department", "Chemistry lab", "Broken sets replaced", by);
        issue("ITM-10", 3, "Physical Education", "Mr. Vinod (PE Head)", "Inter-house football", by);
        inventory.adjust(new AdjustmentRequest("ITM-7", -6, "Breakage found during monthly stock count", by));
    }

    private void opening(String itemId, int qty, String by) {
        Item i = items.findById(itemId).orElseThrow();
        inventory.openingBalance(i, qty, i.getLastPurchasePrice(), by);
    }

    private void issue(String itemId, int qty, String dept, String to, String purpose, String by) {
        inventory.issue(new IssueRequest(itemId, qty, dept, to, purpose, by));
    }

    // ------------------------------------------------------------------ vendors

    private void seedVendors() {
        // Footwear
        vendor("Stride Footwear Pvt Ltd", "Stride Footwear", VendorType.MANUFACTURER, "Chennai", "600032",
                "33AABCS1234F1Z5", "AABCS1234F", List.of("footwear", "sports"),
                contact("Ramesh Kumar", "Sales Manager", "9840012345", "sales@stridefootwear.in", Channel.WHATSAPP),
                VendorStatus.ACTIVE, "NET_30", 7, perf(24, 22, 5.5, 9, 95, 98, 4.6), true, 2019);
        vendor("Bata Distributors Coimbatore", "City Shoe Mart", VendorType.DISTRIBUTOR, "Coimbatore", "641018",
                "33AAFCB5678K1Z2", "AAFCB5678K", List.of("footwear"),
                contact("Priya S", "Owner", "9944056789", "cityshoemart@gmail.com", Channel.WHATSAPP),
                VendorStatus.ACTIVE, "NET_15", 5, perf(18, 15, 9.0, 5, 88, 96, 4.2), false, 2012);
        vendor("Kids Komfort Shoes", "Kids Komfort", VendorType.RETAILER, "Chennai", "600017",
                "33AAJFK9012M1Z8", "AAJFK9012M", List.of("footwear", "uniforms"),
                contact("Abdul Rahman", "Proprietor", "9003390123", "kidskomfort@yahoo.com", Channel.SMS),
                VendorStatus.ACTIVE, "ADVANCE", 10, perf(12, 8, 20.0, 2, 75, 90, 3.6), false, 2016);
        vendor("Sprint Sports & Shoes", "Sprint Sports", VendorType.RETAILER, "Madurai", "625001",
                "33AAKFS3456P1Z1", "AAKFS3456P", List.of("footwear", "sports"),
                contact("Karthik Raja", "Partner", "9789034567", "sprintsports.mdu@gmail.com", Channel.WHATSAPP),
                VendorStatus.ACTIVE, "NET_30", 8, perf(15, 14, 4.0, 6, 92, 94, 4.4), true, 2015);
        Vendor walkwell = vendor("WalkWell Enterprises", "WalkWell", VendorType.DISTRIBUTOR, "Trichy", "620001",
                "33AAGFW7890Q1Z4", "AAGFW7890Q", List.of("footwear"),
                contact("Senthil M", "Manager", "9865078901", "walkwell.trichy@gmail.com", Channel.EMAIL),
                VendorStatus.ACTIVE, "NET_15", 6, perf(9, 6, 14.0, 1, 80, 92, 3.8), false, 2018);
        // Trade licence lapsed -> auto-suspended by the compliance check.
        walkwell.getDocuments().stream().filter(d -> d.getType().equals("TRADE_LICENCE"))
                .forEach(d -> d.setExpiryDate(LocalDate.now().minusDays(4)));

        // Uniforms
        vendor("Uniform House Textiles", "Uniform House", VendorType.MANUFACTURER, "Tiruppur", "641604",
                "33AAHCU2345R1Z6", "AAHCU2345R", List.of("uniforms"),
                contact("Lakshmi N", "Key Accounts", "9442023456", "orders@uniformhouse.co.in", Channel.EMAIL),
                VendorStatus.ACTIVE, "NET_30", 21, perf(10, 10, 6.0, 4, 90, 97, 4.5), true, 2008);
        Vendor tailor = vendor("Smart Tailors & Co", "Smart Tailors", VendorType.SERVICE, "Chennai", "600040",
                "33AAPFS6789S1Z3", "AAPFS6789S", List.of("uniforms"),
                contact("Joseph D", "Owner", "9884067890", "smarttailors@gmail.com", Channel.WHATSAPP),
                VendorStatus.ACTIVE, "ADVANCE", 14, perf(6, 5, 10.0, 1, 83, 88, 3.9), false, 2014);
        tailor.setPendingBankChange(new BankDetails("Smart Tailors & Co", "50200099887766", "HDFC0001234", "HDFC Bank", false));
        tailor.getAudit().add(0, AuditEntry.of("Vendor", "BANK_CHANGE_REQUESTED", "New account ****7766 awaiting approval; payments on hold"));

        // Stationery
        vendor("Saraswathi Stationery Mart", "Saraswathi Stationers", VendorType.DISTRIBUTOR, "Chennai", "600004",
                "33AACFS4567T1Z9", "AACFS4567T", List.of("stationery"),
                contact("Venkatesh R", "Manager", "9841045678", "saraswathi.stationers@gmail.com", Channel.WHATSAPP),
                VendorStatus.ACTIVE, "NET_30", 3, perf(30, 29, 3.0, 14, 97, 99, 4.8), true, 1998);
        vendor("Print Point Supplies", "Print Point", VendorType.RETAILER, "Chennai", "600020",
                "33AAECP8901U1Z7", "AAECP8901U", List.of("stationery", "it"),
                contact("Meena K", "Sales", "9790089012", "printpoint@outlook.com", Channel.EMAIL),
                VendorStatus.ACTIVE, "NET_15", 4, perf(20, 17, 7.5, 6, 89, 95, 4.1), false, 2011);
        vendor("EduMart Office Solutions", "EduMart", VendorType.DISTRIBUTOR, "Bengaluru", "560001",
                "29AACCE1122V1Z5", "AACCE1122V", List.of("stationery", "furniture"),
                contact("Arun Prakash", "Regional Head", "9880011223", "arun@edumart.in", Channel.EMAIL),
                VendorStatus.ACTIVE, "NET_30", 7, perf(14, 12, 8.0, 4, 86, 93, 4.0), true, 2010);

        // Lab
        vendor("Scientific Lab Instruments", "SciLab", VendorType.MANUFACTURER, "Ambala", "133001",
                "06AABCS3344W1Z1", "AABCS3344W", List.of("lab"),
                contact("Harpreet Singh", "Export Sales", "9416033445", "sales@scilab.co.in", Channel.EMAIL),
                VendorStatus.ACTIVE, "ADVANCE", 15, perf(8, 8, 12.0, 3, 87, 99, 4.5), true, 1992);
        vendor("Chennai Science House", "Science House", VendorType.DISTRIBUTOR, "Chennai", "600001",
                "33AAFCC5566X1Z8", "AAFCC5566X", List.of("lab"),
                contact("Ganesh V", "Proprietor", "9444055667", "sciencehouse.chn@gmail.com", Channel.WHATSAPP),
                VendorStatus.ACTIVE, "NET_15", 5, perf(11, 9, 9.0, 4, 91, 95, 4.2), false, 2005);
        vendor("LabCraft Supplies", "LabCraft", VendorType.RETAILER, "Coimbatore", "641002",
                "33AAGFL7788Y1Z2", "AAGFL7788Y", List.of("lab"),
                contact("Divya R", "Sales", "9600077889", "labcraft.cbe@gmail.com", Channel.WHATSAPP),
                VendorStatus.ACTIVE, "NET_30", 7, perf(5, 4, 11.0, 1, 85, 92, 4.0), false, 2017);

        // Furniture
        vendor("Woodcraft School Furniture", "Woodcraft", VendorType.MANUFACTURER, "Hosur", "635109",
                "33AACFW9900Z1Z4", "AACFW9900Z", List.of("furniture"),
                contact("Suresh Babu", "Director", "9443099001", "info@woodcraftfurniture.in", Channel.EMAIL),
                VendorStatus.ACTIVE, "NET_30", 20, perf(6, 6, 16.0, 2, 83, 96, 4.3), true, 2006);
        vendor("Metro Steel Furniture", "Metro Steel", VendorType.MANUFACTURER, "Chennai", "600058",
                "33AABCM1212A1Z6", "AABCM1212A", List.of("furniture"),
                contact("Imran Khan", "Sales Manager", "9962012121", "sales@metrosteel.in", Channel.WHATSAPP),
                VendorStatus.ACTIVE, "NET_15", 14, perf(7, 6, 10.0, 2, 86, 94, 4.1), false, 2009);

        // Onboarding pipeline + blocked vendors
        vendor("Champion Sports Arena", "Champion Sports", VendorType.RETAILER, "Chennai", "600028",
                "33AAICC3434B1Z9", "AAICC3434B", List.of("sports", "footwear"),
                contact("Naveen T", "Owner", "9176034343", "championsports.chn@gmail.com", Channel.WHATSAPP),
                VendorStatus.PENDING_VERIFICATION, "NET_15", 5, new VendorPerformance(), true, 2020);
        Vendor invited = vendor("Fresh Basket Foods", null, VendorType.DISTRIBUTOR, "Chennai", "600024",
                null, null, List.of("canteen"),
                contact("Kavitha J", "Owner", "9087056565", "freshbasket@gmail.com", Channel.WHATSAPP),
                VendorStatus.INVITED, null, null, new VendorPerformance(), true, null);
        invited.getDocuments().clear();
        invited.setBank(null);
        vendor("QuickFix IT Solutions", "QuickFix IT", VendorType.SERVICE, "Chennai", "600096",
                "33AAPFQ7878C1Z3", "AAPFQ7878C", List.of("it"),
                contact("Rahul Menon", "Director", "9840078787", "rahul@quickfixit.in", Channel.EMAIL),
                VendorStatus.BLACKLISTED, "NET_30", 7, perf(5, 2, 40.0, 1, 40, 60, 1.8), false, 2019)
                .setStatusReason("Supplied refurbished projectors as new (PO-2025-0031). Approved by Principal.");
        vendor("CleanPro Housekeeping", "CleanPro", VendorType.DISTRIBUTOR, "Chennai", "600011",
                "33AAFCC9090D1Z1", "AAFCC9090D", List.of("housekeeping"),
                contact("Mohan L", "Sales", "9445090909", "cleanpro.sales@gmail.com", Channel.WHATSAPP),
                VendorStatus.ACTIVE, "NET_15", 2, perf(12, 12, 2.0, 7, 98, 97, 4.7), false, 2013);
    }

    private Vendor vendor(String legal, String trade, VendorType type, String city, String pin, String gstin,
                          String pan, List<String> cats, ContactPerson contact, VendorStatus status, String terms,
                          Integer leadDays, VendorPerformance perf, boolean portal, Integer year) {
        Vendor v = new Vendor();
        v.setId(vendors.nextId());
        v.setCode("VND-" + String.format("%04d", vendors.count() + 1));
        v.setLegalName(legal);
        v.setTradeName(trade);
        v.setType(type);
        v.setYearEstablished(year);
        v.setCity(city);
        v.setPincode(pin);
        v.setRegisteredAddress("No. " + (10 + vendors.count() * 7) + ", Main Road, " + city + " - " + pin);
        v.setGstin(gstin);
        v.setPan(pan);
        v.setCategoryIds(new ArrayList<>(cats));
        v.setContacts(new ArrayList<>(List.of(contact)));
        v.setStatus(status);
        v.setPaymentTerms(terms);
        v.setLeadTimeDays(leadDays);
        v.setMinOrderValue(2000);
        v.setPortalEnabled(portal);
        v.setPerformance(perf);
        v.setCreatedAt(LocalDateTime.now().minusMonths(6 + vendors.count()));
        if (portal && status == VendorStatus.ACTIVE) v.setLastPortalLogin(LocalDateTime.now().minusDays(vendors.count() % 9));
        boolean verified = status == VendorStatus.ACTIVE || status == VendorStatus.BLACKLISTED;
        DocVerification dv = verified ? DocVerification.VERIFIED : DocVerification.PENDING;
        if (gstin != null) v.getDocuments().add(doc("GST_CERT", gstin, null, dv));
        if (pan != null) v.getDocuments().add(doc("PAN", pan, null, dv));
        v.getDocuments().add(doc("TRADE_LICENCE", "TL/" + city.substring(0, 3).toUpperCase() + "/" + (2000 + vendors.count()),
                LocalDate.now().plusDays(vendors.count() == 9 ? 12 : 120 + vendors.count() * 20), dv));
        if (cats.contains("canteen")) v.getDocuments().add(doc("FSSAI", "1242300" + vendors.count(), LocalDate.now().plusDays(25), dv));
        v.setBank(new BankDetails(legal, "00" + (1234567890L + vendors.count() * 1111L), "SBIN0001234", "State Bank of India", verified));
        v.getAudit().add(AuditEntry.of("System", "IMPORTED", "Loaded from mock vendor master"));
        return vendors.save(v);
    }

    private VendorDocument doc(String type, String number, LocalDate expiry, DocVerification dv) {
        return new VendorDocument(UUID.randomUUID().toString(), type, number, LocalDate.now().minusYears(1), expiry, dv,
                type.toLowerCase() + ".pdf");
    }

    private ContactPerson contact(String name, String role, String phone, String email, Channel preferred) {
        return new ContactPerson(name, role, "+91 " + phone, "+91 " + phone, email, preferred, true, true);
    }

    private VendorPerformance perf(int rec, int resp, double hrs, int won, double onTime, double quality, double rating) {
        return new VendorPerformance(rec, resp, hrs, won, onTime, quality, rating);
    }

    // ------------------------------------------------------------------ purchase requests

    private void seedPurchaseRequests() {
        // 1) Stationery - completed, PO issued (under manager limit -> no official needed)
        PurchaseRequest stationery = pr("Term 3 notebooks for Grade 6", "stationery", "Academics - Middle School",
                "Mrs. Anitha (Store Manager)", List.of(
                        new PrLine("ITM-5", "Notebook, 200 pages, ruled", "Long size, school logo on cover", 150, "pc")),
                20, "Main store, Block A", "Academic consumables", "9000");
        sendTo(stationery, "stationery");
        quote(stationery, "Saraswathi Stationers", "40", "12", "0", 3, "NET_30");
        quote(stationery, "Print Point", "44", "12", "150", 4, "NET_15");
        quote(stationery, "EduMart", "41", "12", "300", 6, "NET_30");
        procurement.closeQuotes(stationery.getId(), "Mrs. Anitha (Store Manager)");
        procurement.managerReview(stationery.getId(), new ManagerReviewRequest("SELECT",
                l1(stationery), null, "Mrs. Anitha (Store Manager)"));

        // 2) Lab glassware - waiting for Principal's approval
        PurchaseRequest lab = pr("Chemistry lab glassware restock", "lab", "Science Department",
                "Mr. Prakash (Lab In-charge)", List.of(
                        new PrLine("ITM-8", "Test tube set with stand", "12 borosilicate tubes per set, wooden stand", 40, "set")),
                30, "Chemistry Lab, Block C", "Lab consumables", "25000");
        sendTo(lab, "lab");
        quote(lab, "SciLab", "395", "18", "600", 15, "ADVANCE");
        quote(lab, "Science House", "425", "18", "0", 5, "NET_15");
        quote(lab, "LabCraft", "410", "18", "400", 7, "NET_30");
        procurement.closeQuotes(lab.getId(), "Mr. Prakash (Lab In-charge)");
        String scienceHouse = quoteIdFor(lab, "Science House");
        procurement.managerReview(lab.getId(), new ManagerReviewRequest("SELECT", scienceHouse,
                "Local vendor, 5-day delivery before practical exams; SciLab needs full advance and 15 days.",
                "Mr. Prakash (Lab In-charge)"));
        approveAsPrincipal(lab);

        // 1b) Notebooks arrive: 100 of 150 delivered, 5 torn; 55 still due (50 + 5 replacements).
        String stationeryPo = procurement.get(stationery.getId()).getPurchaseOrderId();
        inventory.receive(new GrnRequest(stationeryPo, 95, 5, "Covers torn in transit", "DC-4471", "SSM/2026/889",
                new BigDecimal("4256.00"), null, "Mr. Selvam (Store Keeper)", "Mrs. Anitha (Store Manager)",
                "Main store, Rack A1", "Balance 50 + 5 replacements promised by Friday"));
        issue("ITM-5", 60, "Academics - Middle School", "Grade 6 A & B", "Term 3 notebooks", "Mr. Selvam (Store Keeper)");

        // 3) Sports shoes - the diagram's example, still collecting quotes
        PurchaseRequest shoes = pr("Sports shoes for athletics team", "footwear", "Physical Education",
                "Mr. Vinod (PE Head)", List.of(
                        new PrLine("ITM-1", "Sports shoes, white, non-marking sole", "Size 5 x4, 6 x6, 7 x5, 8 x3, 9 x2", 20, "pair")),
                21, "Sports room, Ground floor", "Sports & PE", "20000");
        sendTo(shoes, "footwear");
        procurement.submitQuote(shoes.getId(), new QuoteSubmission(rfqId(shoes, "Stride Footwear"),
                new BigDecimal("745"), new BigDecimal("12"), BigDecimal.ZERO, 7, 30, "NET_30",
                "Brand: Stride Pro Runner. Sizes as requested.", true, null, null), true);
        procurement.recordRawReply(shoes.getId(), new RawReplyRequest(rfqId(shoes, "City Shoe Mart"), QuoteSource.WHATSAPP_TEXT,
                "Hello sir, for 20 pairs white sports shoes we can give Rs 720 per pair + GST 12%. Delivery charges Rs 250. "
                        + "Supply within 5 days. Valid for 15 days.", null));
        procurement.recordRawReply(shoes.getId(), new RawReplyRequest(rfqId(shoes, "Kids Komfort"), QuoteSource.VOICE,
                "sir we will give rs.690 per unit. delivery in 10 days. full advance only", "voice_note_0412.ogg"));
        advance(shoes, "Sprint Sports", 2);

        // 4) Desks - quotes closed, under manager review
        PurchaseRequest desks = pr("Dual desks for new Grade 1 section", "furniture", "Primary School",
                "Mrs. Anitha (Store Manager)", List.of(
                        new PrLine("ITM-9", "Dual student desk with bench", "Height 22 in, rounded edges, laminated top", 18, "pc")),
                35, "Grade 1-D classroom", "Infrastructure", "110000");
        sendTo(desks, "furniture");
        quote(desks, "Woodcraft", "5450", "18", "2500", 20, "NET_30");
        quote(desks, "Metro Steel", "4980", "18", "1800", 14, "NET_15");
        quote(desks, "EduMart", "5150", "18", "0", 18, "NET_30");
        procurement.closeQuotes(desks.getId(), "Mrs. Anitha (Store Manager)");

        // 5) Uniforms - just drafted
        pr("Winter blazers for school band", "uniforms", "Co-curricular",
                "Ms. Rekha (Music Coordinator)", List.of(
                        new PrLine("ITM-3", "Blazer, maroon with school crest", "Sizes 28-40, as per size chart", 32, "pc")),
                45, "Music room", "Co-curricular", "60000");
    }

    private PurchaseRequest pr(String title, String cat, String dept, String by, List<PrLine> lines, int dueInDays,
                               String location, String budgetHead, String budget) {
        return procurement.create(new PurchaseRequestCreate(title, cat, dept, by, lines,
                LocalDate.now().plusDays(dueInDays), location, budgetHead, new BigDecimal(budget)));
    }

    private void sendTo(PurchaseRequest pr, String category) {
        List<String> ids = vendorService.list(category, "ACTIVE", null, true).stream().map(Vendor::getId).toList();
        procurement.sendRfq(pr.getId(), new SendRfqRequest(ids, LocalDateTime.now().plusDays(3), pr.getRequestedBy()));
    }

    private void quote(PurchaseRequest pr, String vendor, String price, String tax, String delivery, int days, String terms) {
        procurement.submitQuote(pr.getId(), new QuoteSubmission(rfqId(pr, vendor), new BigDecimal(price),
                new BigDecimal(tax), new BigDecimal(delivery), days, 30, terms, null, true, null, null), true);
    }

    private void advance(PurchaseRequest pr, String vendor, int steps) {
        Rfq r = rfqs.findById(rfqId(pr, vendor)).orElseThrow();
        r.setDeliveredAt(LocalDateTime.now());
        r.setStatus(com.schoolerp.inventory.model.Enums.RfqStatus.DELIVERED);
        if (steps > 1) { r.setReadAt(LocalDateTime.now()); r.setStatus(com.schoolerp.inventory.model.Enums.RfqStatus.READ); }
        rfqs.save(r);
    }

    private String rfqId(PurchaseRequest pr, String vendorName) {
        return rfqs.findByPurchaseRequest(pr.getId()).stream()
                .filter(r -> r.getVendorName().equals(vendorName)).findFirst()
                .orElseThrow(() -> new IllegalStateException("No RFQ for " + vendorName + " on " + pr.getNumber()))
                .getId();
    }

    private String quoteIdFor(PurchaseRequest pr, String vendorName) {
        return procurement.latestQuotesForRound(procurement.get(pr.getId())).stream()
                .filter(q -> q.getVendorName().equals(vendorName)).findFirst().orElseThrow().getId();
    }

    private String l1(PurchaseRequest pr) {
        return procurement.compare(procurement.get(pr.getId())).l1QuoteId();
    }

    private void approveAsPrincipal(PurchaseRequest pr) {
        procurement.officialDecision(pr.getId(), new OfficialDecisionRequest("APPROVE", null, "Dr. Meenakshi (Principal)"));
    }
}
