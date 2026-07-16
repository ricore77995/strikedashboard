import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { yogoFetch } from "@/lib/yogo/fetch";
import { fmtDate, parseReport, isNonActionableLead } from "@/lib/utils";
import { buildChurnReport, type YogoMembershipRow, type YogoClass, type YogoCustomer } from "@/lib/churn-report";

export async function GET() {
  const role = await getSession();
  if (!role) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  try {
    const endDate = fmtDate(new Date());
    const startDate = fmtDate(new Date(Date.now() - 180 * 24 * 60 * 60 * 1000));

    const [membershipsRes, customersRes, classesRes] = await Promise.all([
      yogoFetch<unknown>("reports/memberships-list", {
        method: "POST",
        body: JSON.stringify({ status: ["ended"] }),
      }),
      yogoFetch<unknown>("reports/customers", {
        method: "POST",
        body: JSON.stringify({
          filters: [{
            type: "hasMembershipOrClassPass",
            membershipTypeId: [],
            classPassTypeId: [],
            onlyActiveMembershipsOrClassPasses: false,
          }],
          returnColumnHeaders: true,
        }),
      }),
      yogoFetch<unknown>(`classes?startDate=${startDate}&endDate=${endDate}&populate[]=signups`, {
        method: "GET",
      }),
    ]);

    if (!membershipsRes.ok) throw new Error(`memberships ${membershipsRes.status}`);
    if (!customersRes.ok) throw new Error(`customers ${customersRes.status}`);
    if (!classesRes.ok) throw new Error(`classes ${classesRes.status}`);

    const memberships = parseReport(membershipsRes.data) as unknown as YogoMembershipRow[];
    const allCustomers = parseReport(customersRes.data) as unknown as YogoCustomer[];
    const customers = allCustomers.filter((c) => !isNonActionableLead(c));

    let rawClasses: YogoClass[] = [];
    if (Array.isArray(classesRes.data)) {
      rawClasses = classesRes.data as YogoClass[];
    } else if (classesRes.data && typeof classesRes.data === "object") {
      const wrapped = (classesRes.data as { classes?: unknown }).classes;
      if (Array.isArray(wrapped)) rawClasses = wrapped as YogoClass[];
    }

    const churnerIds = new Set(memberships.map((m) => m.user_id));
    const relevantCustomers = customers.filter((c) => churnerIds.has(c.id));

    const report = buildChurnReport(memberships, rawClasses, relevantCustomers, { startDate, endDate });

    return NextResponse.json(report);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
