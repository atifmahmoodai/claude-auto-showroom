# Power BI starter kit

Everything you need to build a dealership sales, lead and inventory report in Power BI Desktop, using the same data as the web app.

| File | What it is |
|---|---|
| `data/*.csv` | Star-schema tables (24 months of demo data, as of 2026-09-28) |
| `measures.dax` | 38 ready-made DAX measures: units, gross, targets, YoY, funnel, response time, stock aging, days supply |
| `theme.json` | Colour theme matching the web dashboard (View → Themes → Browse for themes) |

> A `.pbix` file isn't included: it can only be saved from Power BI Desktop, which runs on Windows. Building the model from the steps below takes about 20 minutes. Save your result as `ApexAuto.pbix` in this folder.

## Get fresh data

```bash
npm run export:powerbi                        # demo data ending today
npm run export:powerbi -- --date 2026-09-28   # fixed date (reproducible)
npm run export:powerbi -- --from backup.json  # real data: Admin → Data & Power BI → Download backup
```

You can also download each CSV straight from the app (**Dealer login → Data & Power BI**).

## Tables

| Table | Grain | Key columns |
|---|---|---|
| **DimDate** | one row per day | `Date`, `Year`, `Quarter`, `MonthNumber`, `MonthName`, `YearMonth` |
| **DimBranch** | one row per showroom | `BranchID`, `BranchName`, `MonthlyTargetUnits` |
| **DimSalesperson** | one row per salesperson | `SalespersonID`, `SalespersonName`, `BranchID` |
| **DimVehicle** | every vehicle ever stocked | `VehicleID`, make/model/spec, `ListPrice`, `Cost`, `Status`, `AcquiredDate`, `SoldDate`, `DaysInStock` |
| **FactSales** | one row per sale | `VehicleID`, `SoldDate`, `SalePrice`, `Cost`, `GrossProfit`, `DaysToSell` |
| **FactLeads** | one row per lead | `CreatedDate`, `Source`, `LeadType`, `CurrentStage`, `FirstResponseMinutes`, funnel flags (`ReachedContacted`, `ReachedTestDrive`, `ReachedNegotiation`, `IsWon`, `IsLost`, `IsOpen`) |
| **FactLeadStageHistory** | one row per stage change | `LeadID`, `Stage`, `ChangedAt` |
| **FactTargets** | branch × month | `MonthStart`, `BranchID`, `TargetUnits` |

Customer names, emails and phone numbers are deliberately **not** exported.

## Build the model (step by step)

1. **Load the CSVs.** Home → Get data → Text/CSV, one file at a time (or Get data → Folder → `powerbi/data` → Combine & Transform, then split by file name). Click **Transform Data** and check the types:
   - Every `*Date` column and `MonthStart` → **Date**
   - `CreatedAt`, `ChangedAt` → **Date/Time**
   - Money, `Mileage`, `Days*`, `FirstResponseMinutes`, flag columns → **Whole number** (the flags are 1/0)
   - Leave empty cells as null (don't replace them with 0, or response-time averages will be wrong)
2. **Mark the date table.** Select `DimDate` → Table tools → Mark as date table → `Date`.
3. **Create the relationships** (Model view). All are many-to-one, single direction:

   | From (many) | To (one) | Active |
   |---|---|---|
   | `FactSales[SoldDate]` | `DimDate[Date]` | ✅ |
   | `FactLeads[CreatedDate]` | `DimDate[Date]` | ✅ |
   | `FactTargets[MonthStart]` | `DimDate[Date]` | ✅ |
   | `FactSales[VehicleID]` | `DimVehicle[VehicleID]` | ✅ |
   | `DimVehicle[BranchID]` | `DimBranch[BranchID]` | ✅ |
   | `FactLeads[BranchID]` | `DimBranch[BranchID]` | ✅ |
   | `FactTargets[BranchID]` | `DimBranch[BranchID]` | ✅ |
   | `FactSales[SalespersonID]` | `DimSalesperson[SalespersonID]` | ✅ |
   | `FactLeads[SalespersonID]` | `DimSalesperson[SalespersonID]` | ✅ |
   | `FactLeadStageHistory[LeadID]` | `FactLeads[LeadID]` | ✅ |
   | `FactLeads[VehicleID]` | `DimVehicle[VehicleID]` | ❌ inactive |

   **Why this shape:** a branch filter reaches sales through `DimVehicle`. If you also link `FactSales[BranchID]` → `DimBranch`, or make `FactLeads → DimVehicle` active, Power BI finds two filter paths and silently disables one. Don't relate `DimDate` to `DimVehicle` either: stock measures are point-in-time and should ignore the date slicer.
4. **Add the measures.** Home → Enter data → name the table `_Measures`, then copy each measure from `measures.dax` in with **New measure**. Format `%` measures as percentage and money measures as currency.
5. **Apply the theme** (View → Themes → Browse → `theme.json`).

## Suggested report pages

1. **Sales overview.** Cards: Units Sold, Revenue, Gross Profit, Gross Per Unit, Target Attainment %. Clustered column chart of Units Sold by `DimDate[YearMonth]`, with a line of Target Units. Slicers: Year, Month, BranchName.
2. **Lead funnel.** Funnel visual built from Leads, Contact Rate %, Test Drive Rate % and Lead Conversion %. Matrix of `Source` × (Leads, Won Leads, Lead Conversion %, Avg First Response (min)). Card: Unanswered Leads with red conditional formatting.
3. **Inventory aging.** Column chart of Stock Units by the `Aging Bucket` column (the formula is at the bottom of `measures.dax`). Table of vehicles where `Status <> "Sold"`, sorted by `DaysInStock`. Cards: Stock Value at Cost, Aged Stock 90+, Days Supply.
4. **People.** Bar chart of Gross Profit by `SalespersonName`. Matrix of salesperson × Units Sold, Gross Per Unit, Lead Conversion %.

## Checking your numbers

The committed CSVs are as of 2026-09-28. Filtered to Oct 2025 – Sep 2026 with all branches, the Power BI measures should show the values below. They match the web dashboard's **Last 12 months** view for that date. On a later day the web app generates data ending on that day, so run `npm run export:powerbi` again before comparing.

| Measure | Expected |
|---|---|
| Units Sold | 226 |
| Revenue | $5,205,850 |
| Gross Profit | $485,650 |
| Leads | 878 |
| Won Leads | 141 |
| Target Units | 228 (the web app shows 227 because it pro-rates the current, unfinished month) |

If a number differs, the usual cause is a wrong data type (a date loaded as text) or an extra active relationship.
