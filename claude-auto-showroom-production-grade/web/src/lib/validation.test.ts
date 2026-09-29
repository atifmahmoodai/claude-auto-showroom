import { describe, expect, it } from "vitest";
import { validateEnquiry } from "../components/EnquiryForm";
import { validateVehicleDraft } from "../pages/admin/VehicleForm";

const TODAY = "2026-09-28";

describe("validateEnquiry", () => {
  const base = { name: "Ann Lee", email: "ann@example.com", phone: "", type: "Enquiry" as const, preferredDate: "" };
  it("accepts a normal enquiry with email or phone", () => {
    expect(validateEnquiry(base, TODAY)).toEqual({});
    expect(validateEnquiry({ ...base, email: "", phone: "+1 555 123 4567" }, TODAY)).toEqual({});
  });
  it("requires a name and a way to reply", () => {
    const e = validateEnquiry({ ...base, name: " ", email: "", phone: "12" }, TODAY);
    expect(e.name).toBeTruthy();
    expect(e.contact).toBeTruthy();
  });
  it("rejects malformed emails and past test-drive dates", () => {
    expect(validateEnquiry({ ...base, email: "ann@" }, TODAY).email).toBeTruthy();
    expect(validateEnquiry({ ...base, type: "Test Drive", preferredDate: "2026-09-27" }, TODAY).preferredDate).toBeTruthy();
    expect(validateEnquiry({ ...base, type: "Test Drive", preferredDate: TODAY }, TODAY)).toEqual({});
  });
});

describe("validateVehicleDraft", () => {
  const ok = {
    make: "Honda", model: "Civic", year: "2022", mileage: "15000", price: "21000", cost: "18000",
    seats: "5", acquiredDate: "2026-09-01", status: "Available", imageUrl: "",
  };
  it("accepts a valid vehicle", () => {
    expect(validateVehicleDraft(ok, TODAY)).toEqual({});
  });
  it("flags missing and out-of-range fields", () => {
    const e = validateVehicleDraft({ ...ok, make: "", year: "3000", price: "0", mileage: "-1", acquiredDate: "2026-10-01" }, TODAY);
    expect(Object.keys(e).sort()).toEqual(["acquiredDate", "make", "mileage", "price", "year"]);
  });
  it("only allows http(s) photo URLs", () => {
    expect(validateVehicleDraft({ ...ok, imageUrl: "javascript:alert(1)" }, TODAY).imageUrl).toBeTruthy();
    expect(validateVehicleDraft({ ...ok, imageUrl: "https://cdn.example.com/car.jpg" }, TODAY)).toEqual({});
  });
  it("requires sale details for a sold car", () => {
    const e = validateVehicleDraft({ ...ok, status: "Sold", soldDate: "2026-08-01", salePrice: "", salespersonId: "" }, TODAY);
    expect(e.soldDate).toBeTruthy(); // before acquired date
    expect(e.salePrice).toBeTruthy();
    expect(e.salespersonId).toBeTruthy();
  });
});
