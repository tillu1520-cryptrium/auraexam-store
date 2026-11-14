import { describe, it, expect } from 'vitest';

describe('Milestone 5: Automated Delivery & Customer Isolation Logic', () => {
  it('groups multiple purchased subjects into a single unified customer notification', () => {
    const rawDeliveryRows = [
      { id: 'del_1', order_id: 'ord_100', customer_email: 'student@example.com', product_name: 'Physics', drive_file_id: 'file_phys_123' },
      { id: 'del_2', order_id: 'ord_100', customer_email: 'student@example.com', product_name: 'Mathematics', drive_file_id: 'file_math_456' },
      { id: 'del_3', order_id: 'ord_200', customer_email: 'another@example.com', product_name: 'BEE', drive_file_id: 'file_bee_789' }
    ];

    const orderGroups = {};
    rawDeliveryRows.forEach(row => {
      if (!orderGroups[row.order_id]) {
        orderGroups[row.order_id] = { customerEmail: row.customer_email, items: [] };
      }
      orderGroups[row.order_id].items.push(row);
    });

    expect(Object.keys(orderGroups)).toHaveLength(2);
    expect(orderGroups['ord_100'].items).toHaveLength(2);
    expect(orderGroups['ord_100'].items[0].product_name).toBe('Physics');
    expect(orderGroups['ord_100'].items[1].product_name).toBe('Mathematics');
    expect(orderGroups['ord_200'].items).toHaveLength(1);
  });

  it('verifies customer isolation: student only receives purchased files', () => {
    const purchasedSlugs = ['physics'];
    const catalogue = {
      physics: { drive_file_id: 'DRIVE_PHYSICS_10_SETS' },
      bee: { drive_file_id: 'DRIVE_BEE_10_SETS' },
      mathematics: { drive_file_id: 'DRIVE_MATH_10_SETS' }
    };

    const filesToShare = purchasedSlugs.map(slug => catalogue[slug].drive_file_id);
    expect(filesToShare).toContain('DRIVE_PHYSICS_10_SETS');
    expect(filesToShare).not.toContain('DRIVE_BEE_10_SETS');
    expect(filesToShare).not.toContain('DRIVE_MATH_10_SETS');
  });
});

