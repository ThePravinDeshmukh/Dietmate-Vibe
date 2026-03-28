"""
Dietmate MCP Server

Exposes the diet tracker's functionality as MCP tools so any MCP-compatible
client (Claude Desktop, custom agents, etc.) can interact with the app directly.

Run modes:
  stdio  (default) — for Claude Desktop / CLI clients
    python mcp_server.py

  http — for remote / web clients
    python mcp_server.py --http --port 8001
"""

import argparse
import json
import os
from datetime import date, datetime
from typing import Optional

import google.generativeai as genai
from dotenv import load_dotenv
from fastmcp import FastMCP

from diet_data_processor import DietDataProcessor
from models import (
    DIET_ENTRIES_COLLECTION,
    DIET_REQUIREMENTS_COLLECTION,
    get_diet_entries_by_date,
    get_diet_requirements,
    init_db,
)

load_dotenv()

# ---------------------------------------------------------------------------
# Initialise shared resources once at import time
# ---------------------------------------------------------------------------
db = init_db()
diet_processor = DietDataProcessor()
food_categories = diet_processor.process_all_pdfs()

# ---------------------------------------------------------------------------
# MCP server
# ---------------------------------------------------------------------------
mcp = FastMCP(
    name="Dietmate",
    description=(
        "Diet tracking assistant for managing a child's daily food exchanges "
        "and nutritional requirements. Supports reading/writing diet entries, "
        "browsing food exchange lists, and generating AI meal recommendations."
    ),
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalize_category(category: str) -> str:
    normalized = category.lower().replace(" exchange", "")
    mapping = {
        "dried fruits": "dried fruit",
        "fresh fruits": "fresh fruit",
        "other vegetable": "other vegetables",
        "root vegetable": "root vegetables",
        "leafy vegetable": "other vegetables",
        "misc free group": "free group",
        "juices": "free group",
    }
    return mapping.get(normalized, normalized)


def _serialize_entry(entry: dict) -> dict:
    """Make a MongoDB document JSON-safe."""
    entry_date = entry.get("date")
    return {
        "category": entry.get("category", ""),
        "food_item": entry.get("food_item", ""),
        "amount": float(entry.get("amount", 0)),
        "unit": entry.get("unit", ""),
        "notes": entry.get("notes", ""),
        "date": entry_date.date().isoformat() if isinstance(entry_date, datetime) else str(entry_date),
    }


# ---------------------------------------------------------------------------
# Tools — diagnostics
# ---------------------------------------------------------------------------

@mcp.tool()
def health_check() -> dict:
    """Return the current health status of the Dietmate API."""
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}


@mcp.tool()
def database_check() -> dict:
    """Verify that the MongoDB database is reachable."""
    try:
        list(db[DIET_REQUIREMENTS_COLLECTION].find().limit(1))
        return {
            "status": "connected",
            "database": os.getenv("MONGODB_DATABASE", "diet_tracker"),
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as exc:
        return {"status": "error", "detail": str(exc)}


# ---------------------------------------------------------------------------
# Tools — food catalogue
# ---------------------------------------------------------------------------

@mcp.tool()
def get_categories() -> list:
    """List all available food categories (e.g. cereal, fresh fruit, legumes)."""
    return list(food_categories.keys())


@mcp.tool()
def get_daily_requirements() -> list:
    """
    Return the prescribed daily dietary requirements for each food category,
    including the required amount and its unit (exchange / grams / ml).
    """
    reqs = get_diet_requirements()
    # get_diet_requirements already excludes _id
    return reqs


@mcp.tool()
def get_foods_in_category(category: str) -> list:
    """
    Return the food items available within a given exchange category.

    Args:
        category: One of the categories returned by get_categories.

    Returns:
        A list of food items with their portion sizes and exchange values.
    """
    df = diet_processor.get_food_choices(category)
    if df.empty:
        return []
    return df.to_dict(orient="records")


# ---------------------------------------------------------------------------
# Tools — diet entries (read)
# ---------------------------------------------------------------------------

@mcp.tool()
def get_entries_for_date(date_str: str) -> list:
    """
    Fetch all recorded diet entries for a specific date.

    Args:
        date_str: Date in YYYY-MM-DD format (e.g. "2024-03-21").

    Returns:
        List of entries, each with category, food_item, amount, unit, and notes.
    """
    entries = get_diet_entries_by_date(date_str)
    return [_serialize_entry(e) for e in entries]


@mcp.tool()
def get_entries_for_range(start_date: str, end_date: str) -> dict:
    """
    Fetch diet entries for a range of dates (inclusive).

    Args:
        start_date: Start date in YYYY-MM-DD format.
        end_date:   End date in YYYY-MM-DD format.

    Returns:
        A dict keyed by date string, each value a list of entries.
    """
    try:
        start = datetime.strptime(start_date, "%Y-%m-%d").date()
        end = datetime.strptime(end_date, "%Y-%m-%d").date()
        if start > end:
            return {"error": "start_date must be before or equal to end_date"}

        start_dt = datetime.combine(start, datetime.min.time())
        end_dt = datetime.combine(end, datetime.max.time())

        entries = list(db[DIET_ENTRIES_COLLECTION].find({"date": {"$gte": start_dt, "$lte": end_dt}}))

        result: dict = {}
        for entry in entries:
            d = entry.get("date").date().isoformat()
            result.setdefault(d, []).append(_serialize_entry(entry))
        return result
    except ValueError:
        return {"error": "Invalid date format. Use YYYY-MM-DD"}


# ---------------------------------------------------------------------------
# Tools — diet entries (write)
# ---------------------------------------------------------------------------

@mcp.tool()
def add_diet_entry(
    category: str,
    food_item: str,
    amount: float,
    unit: str,
    date_str: Optional[str] = None,
    notes: Optional[str] = None,
) -> dict:
    """
    Add or update a single diet entry for a given category on a given date.
    If an entry for that category already exists on that date it is updated.

    Args:
        category:  Food category (e.g. "cereal", "fresh fruit").
        food_item: Name of the food consumed.
        amount:    Quantity consumed.
        unit:      Unit of measurement (exchange / grams / ml).
        date_str:  Date in YYYY-MM-DD format. Defaults to today.
        notes:     Optional free-text notes.

    Returns:
        {"status": "success"} or {"status": "error", "detail": "..."}.
    """
    try:
        entry_date = date.today()
        if date_str:
            entry_date = datetime.strptime(date_str, "%Y-%m-%d").date()

        normalized = _normalize_category(category)
        start_of_day = datetime.combine(entry_date, datetime.min.time())
        end_of_day = datetime.combine(entry_date, datetime.max.time())

        existing = db[DIET_ENTRIES_COLLECTION].find_one(
            {"date": {"$gte": start_of_day, "$lte": end_of_day}, "category": normalized}
        )

        if existing:
            db[DIET_ENTRIES_COLLECTION].update_one(
                {"_id": existing["_id"]},
                {"$set": {"amount": amount, "notes": notes, "timestamp": datetime.utcnow()}},
            )
        else:
            db[DIET_ENTRIES_COLLECTION].insert_one(
                {
                    "food_item": food_item,
                    "category": normalized,
                    "amount": amount,
                    "unit": unit,
                    "notes": notes,
                    "date": start_of_day,
                    "timestamp": datetime.utcnow(),
                }
            )
        return {"status": "success"}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)}


@mcp.tool()
def add_batch_entries(entries_json: str, date_str: Optional[str] = None) -> dict:
    """
    Add or update multiple diet entries in one call.

    Args:
        entries_json: JSON array string. Each element must have:
                      category, food_item, amount, unit.
                      Example: '[{"category":"cereal","food_item":"rice","amount":2,"unit":"exchange"}]'
        date_str:     Date in YYYY-MM-DD format. Defaults to today.

    Returns:
        {"status": "success", "count": N} or {"status": "error", "detail": "..."}.
    """
    try:
        entries = json.loads(entries_json)
        if not isinstance(entries, list):
            return {"status": "error", "detail": "entries_json must be a JSON array"}

        entry_date = date.today()
        if date_str:
            entry_date = datetime.strptime(date_str, "%Y-%m-%d").date()

        start_of_day = datetime.combine(entry_date, datetime.min.time())
        end_of_day = datetime.combine(entry_date, datetime.max.time())

        existing_map = {
            e["category"]: e
            for e in db[DIET_ENTRIES_COLLECTION].find(
                {"date": {"$gte": start_of_day, "$lte": end_of_day}}
            )
        }

        for entry in entries:
            normalized = _normalize_category(entry["category"])
            if normalized in existing_map:
                db[DIET_ENTRIES_COLLECTION].update_one(
                    {"_id": existing_map[normalized]["_id"]},
                    {
                        "$set": {
                            "amount": entry["amount"],
                            "notes": entry.get("notes"),
                            "timestamp": datetime.utcnow(),
                        }
                    },
                )
            else:
                db[DIET_ENTRIES_COLLECTION].insert_one(
                    {
                        "food_item": entry.get("food_item", normalized),
                        "category": normalized,
                        "amount": entry["amount"],
                        "unit": entry.get("unit", "exchange"),
                        "notes": entry.get("notes"),
                        "date": start_of_day,
                        "timestamp": datetime.utcnow(),
                    }
                )

        return {"status": "success", "count": len(entries)}
    except json.JSONDecodeError:
        return {"status": "error", "detail": "entries_json is not valid JSON"}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)}


@mcp.tool()
def reset_entries(date_str: Optional[str] = None) -> dict:
    """
    Reset all diet entries to zero for the specified date.
    All category slots are recreated with amount=0.

    Args:
        date_str: Date in YYYY-MM-DD format. Defaults to today.

    Returns:
        {"status": "success"} or {"status": "error", "detail": "..."}.
    """
    try:
        entry_date = date.today()
        if date_str:
            entry_date = datetime.strptime(date_str, "%Y-%m-%d").date()

        start_of_day = datetime.combine(entry_date, datetime.min.time())
        end_of_day = datetime.combine(entry_date, datetime.max.time())

        db[DIET_ENTRIES_COLLECTION].delete_many({"date": {"$gte": start_of_day, "$lte": end_of_day}})

        exchange_categories = {"cereal", "dried fruit", "fresh fruit", "legumes",
                               "other vegetables", "root vegetables", "free group"}

        entries = [
            {
                "food_item": cat,
                "category": cat,
                "amount": 0,
                "unit": "exchange" if cat in exchange_categories else "grams",
                "notes": "Reset to 0",
                "date": start_of_day,
                "timestamp": datetime.utcnow(),
            }
            for cat in food_categories
        ]

        if entries:
            db[DIET_ENTRIES_COLLECTION].insert_many(entries)

        return {"status": "success"}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)}


# ---------------------------------------------------------------------------
# Tools — AI recommendations
# ---------------------------------------------------------------------------

@mcp.tool()
def get_recommendations(date_str: Optional[str] = None) -> dict:
    """
    Generate AI-powered meal recommendations based on today's remaining
    dietary requirements using Google Gemini.

    Args:
        date_str: Date in YYYY-MM-DD format. Defaults to today.

    Returns:
        {"recommendations": "<text>"} or {"error": "<message>"}.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return {"error": "GEMINI_API_KEY not set in environment"}

    try:
        target_date = date.today()
        if date_str:
            target_date = datetime.strptime(date_str, "%Y-%m-%d").date()

        start_of_day = datetime.combine(target_date, datetime.min.time())
        end_of_day = datetime.combine(target_date, datetime.max.time())

        food_history = list(db[DIET_ENTRIES_COLLECTION].find(
            {"date": {"$gte": start_of_day, "$lte": end_of_day}}
        ))
        requirements = list(db[DIET_REQUIREMENTS_COLLECTION].find())

        consumed = {e["category"]: e["amount"] for e in food_history}
        remaining = {}
        for req in requirements:
            cat = req["category"]
            required = req["amount"]
            consumed_amount = consumed.get(cat, 0)
            if consumed_amount < required:
                remaining[cat] = {"amount": required - consumed_amount, "unit": req["unit"]}

        available_foods = {}
        for cat in remaining:
            df = diet_processor.get_food_choices(cat)
            if not df.empty:
                available_foods[cat] = [
                    f"{row.get('food_item', 'Unknown')} ({row.get('portion_size', 'n/a')})"
                    for _, row in df.head(5).iterrows()
                ]

        current_hour = datetime.now().hour
        meal_time = (
            "breakfast" if current_hour < 11
            else "lunch" if current_hour < 16
            else "dinner" if current_hour < 22
            else "snack"
        )

        remaining_details = "\n".join(
            f"- {cat}: {details['amount']} {details['unit']} remaining"
            for cat, details in remaining.items()
        )

        prompt = f"""As a specialized pediatric nutritionist, provide recommendations for {meal_time}:

REMAINING DAILY REQUIREMENTS:
{remaining_details}

AVAILABLE FOOD OPTIONS:
{json.dumps(available_foods, indent=2)}

Provide:
1. IMMEDIATE RECOMMENDATIONS — specific food combinations for {meal_time} with exact portions.
2. RECIPE IDEAS (2-3 kid-friendly) — using available ingredients, with portions and exchange values.
3. PLANNING FOR REST OF DAY — how to distribute remaining exchanges across future meals.

Keep suggestions child-appropriate, practical, and based only on listed foods."""

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content(prompt)
        return {"recommendations": response.text}

    except Exception as exc:
        return {"error": str(exc)}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Dietmate MCP Server")
    parser.add_argument("--http", action="store_true", help="Run as HTTP server instead of stdio")
    parser.add_argument("--host", default="0.0.0.0", help="HTTP host (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8001, help="HTTP port (default: 8001)")
    args = parser.parse_args()

    if args.http:
        print(f"Starting Dietmate MCP server (HTTP) on {args.host}:{args.port}")
        mcp.run(transport="streamable-http", host=args.host, port=args.port)
    else:
        # stdio — default mode for Claude Desktop and most MCP clients
        mcp.run(transport="stdio")
