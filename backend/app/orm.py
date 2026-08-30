"""SQLAlchemy ORM models for DukanSaathi Postgres."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid


class Base(DeclarativeBase):
    pass


def _uuid_pk():
    return mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


class Shop(Base):
    __tablename__ = "shops"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    name: Mapped[str] = mapped_column(Text, default="")
    owner_name: Mapped[str] = mapped_column(Text, default="")
    phone: Mapped[str] = mapped_column(Text, default="")
    address: Mapped[str] = mapped_column(Text, default="")
    gst_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    gstin: Mapped[str] = mapped_column(Text, default="")
    invoice_seq: Mapped[int] = mapped_column(Integer, default=1)
    chat_privacy_mode: Mapped[str] = mapped_column(Text, default="strict")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    products: Mapped[list["Product"]] = relationship(back_populates="shop")
    customers: Mapped[list["Customer"]] = relationship(back_populates="shop")
    invoices: Mapped[list["Invoice"]] = relationship(back_populates="shop")


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint("unit IN ('box', 'piece')", name="products_unit_check"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    shop_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("shops.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(Text)
    code: Mapped[str] = mapped_column(Text, default="")
    company: Mapped[str] = mapped_column(Text, default="")
    size: Mapped[str] = mapped_column(Text, default="")
    unit: Mapped[str] = mapped_column(Text, default="box")
    pieces_per_box: Mapped[int] = mapped_column(Integer, default=1)
    sell_price: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    stock_qty: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    low_stock_threshold: Mapped[int] = mapped_column(Integer, default=10)

    shop: Mapped[Shop] = relationship(back_populates="products")


class Customer(Base):
    __tablename__ = "customers"
    __table_args__ = (
        Index("customers_shop_name_lower", "shop_id", text("lower(name)"), unique=True),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    shop_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("shops.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(Text)
    phone: Mapped[str] = mapped_column(Text, default="")
    is_contractor: Mapped[bool] = mapped_column(Boolean, default=False)
    site_note: Mapped[str] = mapped_column(Text, default="")
    total_pending: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    store_credit: Mapped[float] = mapped_column(Numeric(12, 2), default=0)

    shop: Mapped[Shop] = relationship(back_populates="customers")


class Invoice(Base):
    __tablename__ = "invoices"
    __table_args__ = (
        UniqueConstraint("shop_id", "invoice_no", name="invoices_shop_invoice_no_key"),
        CheckConstraint("type IN ('sale', 'purchase', 'return')", name="invoices_type_check"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    shop_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("shops.id", ondelete="CASCADE"))
    invoice_no: Mapped[str] = mapped_column(Text)
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    type: Mapped[str] = mapped_column(Text)
    customer_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True
    )
    customer_name: Mapped[str] = mapped_column(Text, default="")
    customer_phone: Mapped[str] = mapped_column(Text, default="")
    is_contractor: Mapped[bool] = mapped_column(Boolean, default=False)
    site_note: Mapped[str] = mapped_column(Text, default="")
    discount_type: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    discount_value: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    gst_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    gst_rate: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    subtotal: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    discount_off: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    gst_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    grand_total: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    amount_paid: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    amount_pending: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    payment_status: Mapped[str] = mapped_column(Text, default="")
    created_via: Mapped[str] = mapped_column(Text, default="manual")
    settlement: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    settlement_cash: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    settlement_udhari: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    settlement_store_credit: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    settlement_converted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    settlement_converted_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    settlement_converted_to: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    original_invoice_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True
    )
    original_invoice_no: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    refund_total: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)

    shop: Mapped[Shop] = relationship(back_populates="invoices")
    items: Mapped[list["InvoiceItem"]] = relationship(
        back_populates="invoice",
        cascade="all, delete-orphan",
        order_by="InvoiceItem.line_no",
    )
    payments: Mapped[list["Payment"]] = relationship(
        back_populates="invoice",
        cascade="all, delete-orphan",
    )
    allocations: Mapped[list["ReturnAllocation"]] = relationship(
        back_populates="return_invoice",
        cascade="all, delete-orphan",
        foreign_keys="ReturnAllocation.return_invoice_id",
    )


class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id: Mapped[uuid.UUID] = _uuid_pk()
    shop_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("shops.id", ondelete="CASCADE"))
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("invoices.id", ondelete="CASCADE")
    )
    line_no: Mapped[int] = mapped_column(Integer, default=0)
    product_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("products.id"))
    name: Mapped[str] = mapped_column(Text, default="")
    qty: Mapped[float] = mapped_column(Numeric(12, 4), default=0)
    pieces: Mapped[float] = mapped_column(Numeric(12, 4), default=0)
    unit: Mapped[str] = mapped_column(Text, default="box")
    rate: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    pieces_per_box: Mapped[int] = mapped_column(Integer, default=1)
    size: Mapped[str] = mapped_column(Text, default="")

    invoice: Mapped[Invoice] = relationship(back_populates="items")


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint(
            "mode IN ('cash', 'online', 'credit', 'return_adjust')",
            name="payments_mode_check",
        ),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    shop_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("shops.id", ondelete="CASCADE"))
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("invoices.id", ondelete="CASCADE")
    )
    mode: Mapped[str] = mapped_column(Text)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    return_invoice_no: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    invoice: Mapped[Invoice] = relationship(back_populates="payments")


class ReturnAllocation(Base):
    __tablename__ = "return_allocations"

    id: Mapped[uuid.UUID] = _uuid_pk()
    shop_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("shops.id", ondelete="CASCADE"))
    return_invoice_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("invoices.id", ondelete="CASCADE")
    )
    sale_invoice_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True
    )
    sale_invoice_no: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0)

    return_invoice: Mapped[Invoice] = relationship(
        back_populates="allocations",
        foreign_keys=[return_invoice_id],
    )


class StockLedger(Base):
    __tablename__ = "stock_ledger"

    id: Mapped[uuid.UUID] = _uuid_pk()
    shop_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("shops.id", ondelete="CASCADE"))
    product_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("products.id"))
    change: Mapped[float] = mapped_column(Numeric(12, 4))
    reason: Mapped[str] = mapped_column(Text)
    invoice_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True
    )
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Expense(Base):
    __tablename__ = "expenses"

    id: Mapped[uuid.UUID] = _uuid_pk()
    shop_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("shops.id", ondelete="CASCADE"))
    amount: Mapped[float] = mapped_column(Numeric(12, 2))
    note: Mapped[str] = mapped_column(Text, default="")
    mode: Mapped[str] = mapped_column(Text, default="cash")
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
