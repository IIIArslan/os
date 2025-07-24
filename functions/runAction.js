
import fetch from "node-fetch";

const API_URL = "https://api.monday.com/v2";
const API_KEY = process.env.MONDAY_API_KEY || "YOUR_API_KEY_HERE";

async function graphqlQuery(query, variables = {}) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": API_KEY
    },
    body: JSON.stringify({ query, variables })
  });
  return await response.json();
}

// Board ID mapping
const boardMapping = {
  "Leads": "2030966624",
  "Potential": "2030966618",
  "Kayıt & Vize": "2030966612",
  "Akademik": "2030966614"
};

// Connect Boards kolon ID mapping
const connectColumnMapping = {
  "Leads": "board_relation_mkt5e7ge",
  "Potential": "board_relation_mkt5nd8s",
  "Kayıt & Vize": "board_relation_mkt5xv3g",
  "Akademik": "board_relation_mkt5rzbn"
};

// Ankara'da yeni item yarat ve Connect Boards kolonunu güncelle
async function createItemInAnkara(boardName, adanaItemId, itemName) {
  const ankaraBoardId = boardMapping[boardName];
  if (!ankaraBoardId) {
    console.error("Ankara board ID bulunamadı:", boardName);
    return;
  }

  const createQuery = `
    mutation ($boardId: Int!, $itemName: String!) {
      create_item(board_id: $boardId, item_name: $itemName) {
        id
      }
    }
  `;
  const createRes = await graphqlQuery(createQuery, {
    boardId: parseInt(ankaraBoardId),
    itemName: `(Adana) ${itemName}`
  });

  const ankaraItemId = createRes.data.create_item.id;
  console.log("Ankara'da yeni item oluşturuldu:", ankaraItemId);

  const connectColumnId = connectColumnMapping[boardName];
  const connectValue = JSON.stringify({ item_ids: [adanaItemId] });

  const connectQuery = `
    mutation ($boardId: Int!, $itemId: Int!, $columnId: String!, $value: JSON!) {
      change_column_value(
        board_id: $boardId,
        item_id: $itemId,
        column_id: $columnId,
        value: $value
      ) { id }
    }
  `;
  await graphqlQuery(connectQuery, {
    boardId: parseInt(ankaraBoardId),
    itemId: parseInt(ankaraItemId),
    columnId: connectColumnId,
    value: connectValue
  });

  return ankaraItemId;
}

// Ankara item kolon güncelle
async function updateItemInAnkara(boardName, adanaItemId, columnId, newValue) {
  const ankaraBoardId = boardMapping[boardName];
  if (!ankaraBoardId) return;

  const connectColumnId = connectColumnMapping[boardName];

  const itemsQuery = `
    query ($boardId: Int!) {
      boards (ids: [$boardId]) {
        items {
          id
          column_values {
            id
            value
          }
        }
      }
    }
  `;
  const itemsRes = await graphqlQuery(itemsQuery, { boardId: parseInt(ankaraBoardId) });
  const items = itemsRes.data.boards[0].items;

  const targetItem = items.find(item => {
    const connectColumn = item.column_values.find(cv => cv.id === connectColumnId);
    return connectColumn && connectColumn.value && connectColumn.value.includes(adanaItemId);
  });

  if (!targetItem) {
    console.log("Eşleşen Ankara item bulunamadı:", adanaItemId);
    return;
  }

  const ankaraItemId = targetItem.id;

  const updateQuery = `
    mutation ($boardId: Int!, $itemId: Int!, $columnId: String!, $value: String!) {
      change_simple_column_value(
        board_id: $boardId,
        item_id: $itemId,
        column_id: $columnId,
        value: $value
      ) { id }
    }
  `;

  await graphqlQuery(updateQuery, {
    boardId: parseInt(ankaraBoardId),
    itemId: parseInt(ankaraItemId),
    columnId,
    value: newValue
  });
  console.log("Ankara'daki item güncellendi:", ankaraItemId);
}

export async function handler(event) {
  try {
    const payload = JSON.parse(event.body);
    const boardName = payload.payload.boardName;
    const itemName = payload.payload.itemName;
    const adanaItemId = payload.payload.itemId;
    const columnId = payload.payload.columnId;
    const newValue = payload.payload.value;
    const changeType = payload.payload.eventType;

    if (!boardMapping[boardName]) {
      console.log("Adana board eşleşmesi yok:", boardName);
      return { statusCode: 200, body: "No action" };
    }

    if (changeType === "item_created") {
      await createItemInAnkara(boardName, adanaItemId, itemName);
    } else if (changeType === "column_value_changed") {
      await updateItemInAnkara(boardName, adanaItemId, columnId, newValue);
    }

    return { statusCode: 200, body: "OK" };
  } catch (error) {
    console.error("Hata:", error);
    return { statusCode: 500, body: "Error" };
  }
}
