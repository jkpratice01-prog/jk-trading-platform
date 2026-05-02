"""Institutional ownership and activity tracker."""
import pandas as pd
from datetime import datetime
from server.services.yf_session import ticker as yf_ticker


def get_institutional_holders(symbol: str) -> dict:
    """Fetch institutional holders for a symbol using yfinance."""
    try:
        ticker = yf_ticker(symbol.upper())
        holders = ticker.institutional_holders
        if holders is None or holders.empty:
            return {"holders": [], "message": "No institutional holders data available"}

        # Convert to list of dicts
        holders_list = []
        for _, row in holders.iterrows():
            holders_list.append({
                "holder": row.get("Holder"),
                "shares": int(row.get("Shares", 0)),
                "dateReported": row.get("Date Reported", "").strftime("%Y-%m-%d") if pd.notna(row.get("Date Reported")) else None,
                "pctHeld": round(float(row.get("% Out", 0)), 2),
                "value": int(row.get("Value", 0)),
            })

        return {
            "symbol": symbol.upper(),
            "holders": holders_list,
            "totalHolders": len(holders_list),
            "fetchedAt": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        return {"error": str(e), "holders": []}


def get_major_holders(symbol: str) -> dict:
    """Fetch major holders breakdown (institutional, insider, etc.)."""
    try:
        ticker = yf_ticker(symbol.upper())
        major_holders = ticker.major_holders
        if major_holders is None or major_holders.empty:
            return {"breakdown": {}, "message": "No major holders data available"}

        # major_holders is a DataFrame with index as descriptions and a 'Value' column with data
        breakdown = {}
        for label in major_holders.index:
            value = major_holders.loc[label, "Value"]
            # For "Count" fields, don't multiply by 100; for percentage fields, do
            if "Count" in label or "count" in label:
                breakdown[label] = int(value)
            else:
                # These are already decimals (e.g., 0.65248), convert to percentage
                pct_val = float(value) * 100
                breakdown[label] = round(pct_val, 2)

        return {
            "symbol": symbol.upper(),
            "breakdown": breakdown,
            "fetchedAt": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        return {"error": str(e), "breakdown": {}}
