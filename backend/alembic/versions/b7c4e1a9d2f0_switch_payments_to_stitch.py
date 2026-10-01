"""switch payments to stitch

Stitch replaced the previous payment provider. The provider's payment id
column becomes provider_reference, which holds Stitch's payment request id
(longer than the old ids, hence the wider type) and is indexed because
Stitch's webhook finds the order by it.

Revision ID: b7c4e1a9d2f0
Revises: 66ff3d47e2a1
Create Date: 2026-10-01 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b7c4e1a9d2f0'
down_revision: Union[str, None] = '66ff3d47e2a1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OLD_COLUMN = 'payfast_payment_id'


def upgrade() -> None:
    op.alter_column(
        'orders',
        OLD_COLUMN,
        new_column_name='provider_reference',
        type_=sa.String(length=255),
        existing_type=sa.String(length=100),
        existing_nullable=False,
    )
    op.create_index(op.f('ix_orders_provider_reference'), 'orders', ['provider_reference'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_orders_provider_reference'), table_name='orders')
    op.alter_column(
        'orders',
        'provider_reference',
        new_column_name=OLD_COLUMN,
        type_=sa.String(length=100),
        existing_type=sa.String(length=255),
        existing_nullable=False,
    )
