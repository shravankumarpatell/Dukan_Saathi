"""Per-shop session memory: last entity tokens and date window. No raw names in prompts."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from uuid import UUID

from app.analyst.resolvers import DateWindow, EntityHit

_TTL_S = 60 * 60
_store: dict[str, "ShopMemory"] = {}


@dataclass
class ShopMemory:
    window: DateWindow | None = None
    entities: list[EntityHit] = field(default_factory=list)
    focus_product: EntityHit | None = None
    last_sql: str = ""
    last_user_questions: list[str] = field(default_factory=list)
    updated: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def note(self) -> str:
        bits = []
        if self.window:
            bits.append(
                f"last_window={self.window.start.isoformat()}..{self.window.end.isoformat()}"
            )
        for e in self.entities:
            bits.append(f"{e.token}={e.kind}:{e.id}")
        if self.focus_product:
            bits.append(
                f"focus_product={self.focus_product.display}:{self.focus_product.id}"
            )
        if self.last_user_questions:
            bits.append("PRIOR_USER: " + " || ".join(self.last_user_questions[-6:]))
        return "; ".join(bits)


def get_memory(shop_id: UUID) -> ShopMemory:
    key = str(shop_id)
    mem = _store.get(key)
    if mem is None:
        mem = ShopMemory()
        _store[key] = mem
        return mem
    age = (datetime.now(timezone.utc) - mem.updated).total_seconds()
    if age > _TTL_S:
        mem = ShopMemory()
        _store[key] = mem
    return mem


def clear_memory(shop_id: UUID | None = None) -> None:
    if shop_id is None:
        _store.clear()
        return
    _store.pop(str(shop_id), None)


def put_memory(
    shop_id: UUID,
    window: DateWindow | None,
    entities: list[EntityHit],
    sql: str = "",
    user_question: str = "",
    focus_product: EntityHit | None = None,
) -> None:
    mem = get_memory(shop_id)
    if window:
        mem.window = window
    if entities:
        mem.entities = entities
        prod = next((e for e in entities if e.kind == "product"), None)
        if prod and prod.id:
            mem.focus_product = prod
    if focus_product and focus_product.kind == "product":
        mem.focus_product = focus_product
        # Keep entities aligned so follow-ups without deixis still have a product bind.
        rest = [e for e in mem.entities if e.kind != "product"]
        mem.entities = [focus_product] + rest
    if sql:
        mem.last_sql = sql
    if user_question:
        mem.last_user_questions.append(user_question)
        mem.last_user_questions = mem.last_user_questions[-6:]
    mem.updated = datetime.now(timezone.utc)
