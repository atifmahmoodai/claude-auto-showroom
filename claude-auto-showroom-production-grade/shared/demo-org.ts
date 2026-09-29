import type { Org } from "./types";

/** Branches and sales staff used by the demo seed. Real deployments manage these in the admin. */
export const DEMO_ORG: Org = {
  branches: [
    { id: "b-downtown", name: "Downtown", city: "Springfield", phone: "+1 (555) 010-2000", address: "120 Main Street, Springfield", monthlyTarget: 11 },
    { id: "b-northside", name: "Northside", city: "Springfield", phone: "+1 (555) 010-3000", address: "48 Ridge Road, Springfield", monthlyTarget: 8 },
  ],
  salespeople: [
    { id: "s-maya", name: "Maya Chen", branchId: "b-downtown" },
    { id: "s-omar", name: "Omar Haddad", branchId: "b-downtown" },
    { id: "s-lucas", name: "Lucas Rivera", branchId: "b-downtown" },
    { id: "s-sara", name: "Sara Ahmed", branchId: "b-northside" },
    { id: "s-james", name: "James Okafor", branchId: "b-northside" },
  ],
};
