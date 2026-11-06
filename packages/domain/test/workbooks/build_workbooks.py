"""
Builds the consolidation reference workbooks used by consolidate.workbook.test.ts.

The expected results in each workbook are Excel formulas (SUMIFS, ROUND, MIN),
worked out by the spreadsheet itself, not by Vantiq's code. After writing the
files, LibreOffice recalculates them so the cached values are stored.

    python3 build_workbooks.py   # needs openpyxl and LibreOffice (soffice)

Conventions, the same as Vantiq's: amounts are natural sign (income positive,
spend positive, credits negative); rates are reporting currency (USD) per one
unit of the entity's currency; each line is translated and rounded on its own.
"""
import os
import shutil
import subprocess
import tempfile

from openpyxl import Workbook
from openpyxl.styles import Font

HERE = os.path.dirname(os.path.abspath(__file__))
MONTHS = ["2026-07", "2026-08", "2026-09"]
BOLD = Font(bold=True)

ACCOUNTS = [
    # code, category, kind
    ("4100", "rev-collab", "revenue"),
    ("4200", "rev-grant", "revenue"),
    ("4900", "rev-collab", "revenue"),  # intercompany service revenue
    ("4950", "rev-collab", "revenue"),  # intercompany management fees
    ("6010", "rd-people", "opex"),
    ("6110", "rd-cro", "opex"),
    ("6310", "rd-lab", "opex"),
    ("6450", "rd-consult", "opex"),  # intercompany research services
    ("7010", "ga-people", "opex"),
    ("7310", "ga-software", "opex"),
    ("7450", "ga-professional", "opex"),  # intercompany management fees
    ("7470", "ga-software", "opex"),  # shared software recharged between entities
]
CATEGORY = {a: c for a, c, _ in ACCOUNTS}

ENTITIES = [
    ("US", "Group parent, Inc.", "USD", "Yes"),
    ("UK", "UK research Ltd", "GBP", "No"),
    ("AU", "Australia trials Pty Ltd", "AUD", "No"),
    ("DE", "Germany GmbH", "EUR", "No"),
]

RATES = [
    # month, currency, average, closing
    ("2026-07", "GBP", "1.2734", "1.2811"),
    ("2026-08", "GBP", "1.2690", "1.2655"),
    ("2026-09", "GBP", "1.2817", "1.2902"),
    ("2026-07", "AUD", "0.6612", "0.6587"),
    ("2026-08", "AUD", "0.6548", "0.6603"),
    ("2026-09", "AUD", "0.6671", "0.6702"),
    ("2026-07", "EUR", "1.0842", "1.0875"),
    ("2026-08", "EUR", "1.0917", "1.0899"),
    ("2026-09", "EUR", "1.1003", "1.1046"),
]


def sheet(wb, title, headers, rows):
    ws = wb.create_sheet(title)
    ws.append(headers)
    for c in ws[1]:
        c.font = BOLD
    for r in rows:
        ws.append(list(r))
    for i, _ in enumerate(headers):
        ws.column_dimensions[chr(65 + i)].width = 16
    return ws


def base_sheets(wb, entities, lines, cash, readme):
    wb.remove(wb.active)
    sheet(wb, "Read me", ["Notes"], [(line,) for line in readme])
    sheet(wb, "Entities", ["Entity", "Name", "Currency", "Parent"], entities)
    sheet(wb, "Rates", ["Month", "Currency", "Average", "Closing"], [(m, c, float(a), float(cl)) for m, c, a, cl in RATES])
    sheet(wb, "Accounts", ["Account", "Category", "Kind"], ACCOUNTS)
    n = len(lines) + 1
    rows = []
    for i, (ent, date, acct, amount, memo) in enumerate(lines, start=2):
        rows.append(
            (
                ent,
                date,
                acct,
                CATEGORY[acct],
                amount,
                memo,
                f"=LEFT(B{i},7)",
                f"=VLOOKUP(A{i},Entities!$A:$C,3,FALSE)",
                f'=IF(H{i}="USD",1,SUMIFS(Rates!$C:$C,Rates!$A:$A,G{i},Rates!$B:$B,H{i}))',
                f"=ROUND(E{i}*I{i},2)",
            )
        )
    sheet(wb, "Lines", ["Entity", "Date", "Account", "Category", "Local amount", "Memo", "Month", "Currency", "Average rate", "USD amount"], rows)
    crow = []
    for i, (ent, month, bal) in enumerate(cash, start=2):
        crow.append(
            (
                ent,
                month,
                bal,
                f"=VLOOKUP(A{i},Entities!$A:$C,3,FALSE)",
                f'=IF(D{i}="USD",1,SUMIFS(Rates!$D:$D,Rates!$A:$A,B{i},Rates!$B:$B,D{i}))',
                f"=ROUND(C{i}*E{i},2)",
            )
        )
    sheet(wb, "Cash", ["Entity", "Month", "Local balance", "Currency", "Closing rate", "USD balance"], crow)
    return n


def consolidated_sheet(wb, with_eliminations):
    cats = sorted({c for _, c, _ in ACCOUNTS})
    rows = []
    i = 2
    for cat in cats:
        for m in MONTHS:
            f = f"=SUMIFS(Lines!$J:$J,Lines!$D:$D,A{i},Lines!$G:$G,B{i})"
            if with_eliminations:
                f += f"-SUMIFS(Eliminations!$N:$N,Eliminations!$G:$G,A{i},Eliminations!$B:$B,B{i})"
                f += f"-SUMIFS(Eliminations!$O:$O,Eliminations!$H:$H,A{i},Eliminations!$B:$B,B{i})"
            rows.append((cat, m, f))
            i += 1
    sheet(wb, "Expected consolidated", ["Category", "Month", "USD amount"], rows)
    cash = [(m, f"=SUMIFS(Cash!$F:$F,Cash!$B:$B,A{j})") for j, m in enumerate(MONTHS, start=2)]
    sheet(wb, "Expected cash", ["Month", "USD balance"], cash)


def recalc(paths):
    out = tempfile.mkdtemp()
    subprocess.run(["soffice", "--headless", "--calc", "--convert-to", "xlsx:Calc MS Excel 2007 XML", "--outdir", out, *paths], check=True, capture_output=True)
    for p in paths:
        shutil.move(os.path.join(out, os.path.basename(p)), p)


def translation_workbook(path):
    wb = Workbook()
    lines = [
        ("US", "2026-07-05", "6110", 182_400.00, "CRO services"),
        ("US", "2026-07-28", "7010", 96_250.50, "Payroll"),
        ("US", "2026-08-05", "6110", 191_020.17, "CRO services"),
        ("US", "2026-08-25", "4200", 450_000.00, "Grant drawdown"),
        ("US", "2026-09-05", "6110", 176_880.40, "CRO services"),
        ("US", "2026-09-12", "6110", -12_500.00, "CRO credit note"),
        ("UK", "2026-07-15", "6010", 84_310.33, "Salaries"),
        ("UK", "2026-07-21", "6310", 12_745.19, "Reagents"),
        ("UK", "2026-08-15", "6010", 84_890.07, "Salaries"),
        ("UK", "2026-08-19", "6310", 9_870.41, "Reagents"),
        ("UK", "2026-08-30", "6310", -1_204.35, "Supplier refund"),
        ("UK", "2026-09-15", "6010", 85_102.66, "Salaries"),
        ("UK", "2026-09-22", "6310", 14_002.02, "Reagents"),
        ("AU", "2026-07-09", "6110", 266_118.45, "Site payments"),
        ("AU", "2026-08-09", "6110", 241_903.70, "Site payments"),
        ("AU", "2026-09-09", "6110", 305_377.95, "Site payments"),
        ("AU", "2026-09-30", "4100", 35_000.00, "Partner reimbursement"),
        ("DE", "2026-07-30", "7310", 4_811.11, "Software"),
        ("DE", "2026-08-30", "7310", 4_811.11, "Software"),
        ("DE", "2026-09-30", "7310", 5_120.99, "Software"),
        ("DE", "2026-09-30", "7010", 18_333.37, "Payroll"),
    ]
    cash = [(e, m, b) for e, bs in [("US", [41_200_000.00, 39_850_000.00, 38_120_455.12]), ("UK", [2_150_000.00, 1_980_410.77, 1_802_336.09]), ("AU", [3_400_000.00, 3_105_224.40, 2_811_090.18]), ("DE", [250_000.00, 242_118.30, 236_004.55])] for m, b in zip(MONTHS, bs)]
    base_sheets(wb, ENTITIES, lines, cash, [
        "FX translation reference for Vantiq's consolidate().",
        "Income and expense lines translate at the month's average rate, cash at the closing rate.",
        "Each line is rounded to the cent with ROUND, then summed.",
        "Expected results are formulas on the 'Expected' sheets.",
    ])
    consolidated_sheet(wb, with_eliminations=False)
    wb.save(path)


def eliminations_workbook(path):
    wb = Workbook()
    lines = [
        # External activity
        ("US", "2026-07-05", "6110", 182_400.00, "CRO services"),
        ("US", "2026-08-05", "6110", 191_020.17, "CRO services"),
        ("US", "2026-09-05", "6110", 176_880.40, "CRO services"),
        ("UK", "2026-07-15", "6010", 84_310.33, "Salaries"),
        ("UK", "2026-08-15", "6010", 84_890.07, "Salaries"),
        ("UK", "2026-09-15", "6010", 85_102.66, "Salaries"),
        ("AU", "2026-07-09", "6110", 266_118.45, "Site payments"),
        ("AU", "2026-08-09", "6110", 241_903.70, "Site payments"),
        ("AU", "2026-09-09", "6110", 305_377.95, "Site payments"),
        ("US", "2026-07-20", "7310", 22_400.00, "Software"),
        ("US", "2026-08-20", "7310", 22_400.00, "Software"),
        ("US", "2026-09-20", "7310", 23_150.00, "Software"),
        # P1: UK research services to the parent, cost plus 8%.
        # Jul: the parent books exactly the translated amount (91,055.16 x 1.2734 = 115,949.64).
        ("UK", "2026-07-31", "4900", 91_055.16, "Research services Jul"),
        ("US", "2026-07-31", "6450", 115_949.64, "UK research services Jul"),
        # Aug: two invoices; the parent books them at July's rate, so the sides differ by FX.
        ("UK", "2026-08-16", "4900", 45_000.00, "Research services Aug (1 of 2)"),
        ("UK", "2026-08-31", "4900", 46_681.27, "Research services Aug (2 of 2)"),
        ("US", "2026-08-31", "6450", 116_747.13, "UK research services Aug"),
        # Sep: UK has invoiced, the parent hasn't booked it yet (timing).
        ("UK", "2026-09-30", "4900", 92_340.55, "Research services Sep"),
        # P2: parent's management fee to Australia, with a credit note in August.
        ("US", "2026-07-31", "4950", 40_000.00, "Management fee Jul"),
        ("AU", "2026-07-31", "7450", 60_496.07, "Management fee Jul"),
        ("US", "2026-08-31", "4950", 40_000.00, "Management fee Aug"),
        ("US", "2026-08-31", "4950", -5_000.00, "Management fee Aug credit note"),
        ("AU", "2026-08-31", "7450", 61_087.36, "Management fee Aug"),
        ("AU", "2026-08-31", "7450", -7_635.92, "Management fee Aug credit note"),
        ("US", "2026-09-30", "4950", 40_000.00, "Management fee Sep"),
        ("AU", "2026-09-30", "7450", 59_961.03, "Management fee Sep"),
        # P3: Germany recharges shared software to the parent as a credit to its own cost.
        ("DE", "2026-07-30", "7470", -4_811.11, "Software recharged to parent"),
        ("US", "2026-07-30", "7470", 5_216.31, "Software recharge from Germany"),
        ("DE", "2026-08-30", "7470", -4_811.11, "Software recharged to parent"),
        ("US", "2026-08-30", "7470", 5_252.39, "Software recharge from Germany"),
        ("DE", "2026-09-30", "7470", -5_120.99, "Software recharged to parent"),
        ("US", "2026-09-30", "7470", 5_634.62, "Software recharge from Germany"),
    ]
    cash = [(e, m, b) for e, bs in [("US", [41_200_000.00, 39_850_000.00, 38_120_455.12]), ("UK", [2_150_000.00, 1_980_410.77, 1_802_336.09]), ("AU", [3_400_000.00, 3_105_224.40, 2_811_090.18]), ("DE", [250_000.00, 242_118.30, 236_004.55])] for m, b in zip(MONTHS, bs)]
    base_sheets(wb, ENTITIES, lines, cash, [
        "Intercompany elimination reference for Vantiq's consolidate().",
        "For each pair and month: each side's effect on net income (income +, cost -) is worked out in USD.",
        "When the two effects have opposite signs, the smaller amount is eliminated from both sides.",
        "What is left stays in the books and the pair is flagged when it is more than $1.",
        "Expected results are formulas on the 'Eliminations' and 'Expected' sheets.",
    ])
    pairs = [("P1", "UK", "4900", "US", "6450"), ("P2", "US", "4950", "AU", "7450"), ("P3", "DE", "7470", "US", "7470")]
    sheet(wb, "Pairs", ["Pair", "Entity", "Account", "Counterparty", "Counterparty account"], pairs)
    rows = []
    i = 2
    for pid, ea, aa, eb, ab in pairs:
        for m in MONTHS:
            rows.append(
                (
                    pid,
                    m,
                    ea,
                    aa,
                    eb,
                    ab,
                    f"=VLOOKUP(D{i},Accounts!$A:$C,2,FALSE)",
                    f"=VLOOKUP(F{i},Accounts!$A:$C,2,FALSE)",
                    f"=SUMIFS(Lines!$J:$J,Lines!$A:$A,C{i},Lines!$C:$C,D{i},Lines!$G:$G,B{i})",
                    f"=SUMIFS(Lines!$J:$J,Lines!$A:$A,E{i},Lines!$C:$C,F{i},Lines!$G:$G,B{i})",
                    f'=IF(VLOOKUP(D{i},Accounts!$A:$C,3,FALSE)="revenue",I{i},-I{i})',
                    f'=IF(VLOOKUP(F{i},Accounts!$A:$C,3,FALSE)="revenue",J{i},-J{i})',
                    f"=IF(AND(K{i}<>0,L{i}<>0,SIGN(K{i})<>SIGN(L{i})),MIN(ABS(K{i}),ABS(L{i})),0)",
                    f"=SIGN(I{i})*M{i}",
                    f"=SIGN(J{i})*M{i}",
                    f"=K{i}+L{i}",
                    f'=IF(ABS(P{i})<=1,"matched",IF(OR(I{i}=0,J{i}=0),"one_sided","difference"))',
                )
            )
            i += 1
    headers = ["Pair", "Month", "Entity", "Account", "Counterparty", "Counterparty account", "Category", "Counterparty category", "Side USD", "Counterparty USD", "Side effect on net income", "Counterparty effect on net income", "Eliminated", "Eliminated from side", "Eliminated from counterparty", "Difference", "Status"]
    sheet(wb, "Eliminations", headers, rows)
    consolidated_sheet(wb, with_eliminations=True)
    wb.save(path)


if __name__ == "__main__":
    a = os.path.join(HERE, "fx-translation.xlsx")
    b = os.path.join(HERE, "intercompany-eliminations.xlsx")
    translation_workbook(a)
    eliminations_workbook(b)
    recalc([a, b])
    print("wrote", a, b)
