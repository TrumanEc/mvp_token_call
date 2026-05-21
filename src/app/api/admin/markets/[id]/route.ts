import { NextRequest, NextResponse } from "next/server";
import { MarketService } from "@/services/market";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { question, description, resolutionDate, sport, imageUrl, bannerUrl, isFeatured, rules, criterio, tags } = body;

    const updatedMarket = await MarketService.updateMeta(id, {
      question,
      description,
      resolutionDate: resolutionDate ? new Date(resolutionDate) : undefined,
      sport,
      imageUrl,
      bannerUrl,
      isFeatured,
      rules,
      criterio,
      tags,
    });

    return NextResponse.json(updatedMarket);
  } catch (error: any) {
    console.error("Error updating market:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await MarketService.deleteMarket(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting market:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
