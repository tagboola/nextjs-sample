import { defineTool } from "@genkit-ai/ai";
import * as z from "zod";

import sdk, { V3BusinessSearchMetadataParam } from "@api/yelp-developers";
import * as chrono from "chrono-node";
import moment from "moment";
// import { HTMLToJSON } from "html-to-json-parser";
// import * as HTMLParser from "fast-html-parser";
// import * as cheerio from "cheerio";

const YelpBusinessDetailsSchema = z
  .object({
    id: z.string().describe("Yelp Encrypted Business ID"),
    alias: z
      .string()
      .describe(
        "Unique Yelp alias of this business. Can contain unicode characters."
      ),
    name: z.string().describe("Name of the business"),
    rating: z
      .number()
      .describe(
        "Rating for this business (value ranges from 1, 1.5, ... 4.5, 5)"
      )
      .optional(),
    categories: z
      .array(
        z.object({
          alias: z
            .string()
            .describe(
              "Alias of a category, when searching for business in certain categories, use alias rather than the title"
            ),
          title: z.string().describe("Title of a category for display purpose"),
        })
      )
      .describe(
        "List of category title and alias pairs associated with this business"
      )
      .optional(),
    attributes: z
      .object({
        menu_url: z
          .string()
          .optional()
          .nullable()
          .describe("URL to the businesses menu"),
      })
      .partial()
      .passthrough()
      .describe("Various feautures or facilities provided by the business")
      .optional(),
    data: z
      .object({
        reservation_openings: z
          .array(
            z
              .string()
              .describe(
                "The available open reservation time. This is of the format HH:MM and is in a 24-hour clock."
              )
          )
          .describe("A list of additional reservation opening times"),
      })
      .partial()
      .passthrough()
      .describe("	An object containing additional data on the search query")
      .optional(),
  })
  .passthrough();

const YelpListOfBusinessDetailsSchema = z.array(YelpBusinessDetailsSchema);

const YelpBusinessSearchParametersScehma = z.object({
  location: z
    .string()
    .describe(
      `Your location. This string indicates the geographic area to be used when searching for businesses. Examples: "New York City", "NYC", "350 5th Ave, New York, NY 10118"`
    ),
  term: z.string().describe("Your location").optional(),
  categories: z
    .array(
      z
        .string()
        .describe(
          "Category alias. Only valid supported category aliases can be provided."
        )
    )
    .describe(
      "Categories to filter the search results with. The category alias should be used."
    )
    .optional(),
  reservationTime: z
    .string()
    .describe(
      "The time of the requested reservation, format is HH:MM. This must be included if you are searching for businesses that support reservations"
    )
    .optional(),
  reservationDate: z
    .string()
    .describe(
      "The date for the reservation, format is YYYY-mm-dd. This must be included if you are searching for businesses that support reservations"
    )
    .optional(),
  reservationCovers: z
    .number()
    .describe(
      "How many people are attending the reservation (min. value is 1; max value is 10). This must be included if you are searching for businesses that support reservations."
    )
    .optional(),
});

const YelpCategorySchema = z.object({
  alias: z.string().describe("Category alias"),
  title: z.string().describe("Title of this category"),
});

const YelpCategoriesSchema = z.array(YelpCategorySchema);

export const yelpCategoriesTool = defineTool(
  {
    name: "yelpCategories",
    description:
      "Use this fetch all the supported Yelp business categories across all locales by default.",
    inputSchema: z.void(),
    outputSchema: YelpCategoriesSchema,
  },
  async () => {
    const response = await fetch("https://api.yelp.com/v3/categories");
    const json = await response.json();
    console.log(json);
    return YelpCategoriesSchema.parse(json);
  }
);

export const yelpBusinessSearchTool = defineTool(
  {
    name: "yelpBusinessSearch",
    description: "Use this tool to search for businesses on Yelp.",
    inputSchema: YelpBusinessSearchParametersScehma,
    outputSchema: YelpListOfBusinessDetailsSchema,
  },
  async ({
    location,
    term,
    categories,
    reservationTime,
    reservationCovers,
    reservationDate,
  }) => {
    const params: V3BusinessSearchMetadataParam = {
      sort_by: "best_match",
      location,
      reservation_covers: reservationCovers,
    };

    if (term) {
      params.term = term;
    }

    if (categories) {
      params.categories = categories;
    }

    if (reservationDate) {
      console.log(`Raw Reservation Date: ${reservationDate}`);
      const date = chrono.parseDate(reservationDate);
      console.log(`Parsed Reservation Date: ${date}`);
      const formattedDate = moment(date).format("YYYY-MM-DD");
      params.reservation_date = formattedDate;
    }

    if (reservationTime) {
      console.log(`Raw Reservation Time: ${reservationTime}`);
      const time = chrono.parseDate(reservationTime);
      const formattedTime = moment(time).format("HH:mm");
      console.log(`Parsed Reservation Time: ${formattedTime}`);
      params.reservation_time = formattedTime;
    }

    console.log("Business search parameters");
    console.log(params);
    const response = await sdk.v3_business_search(params);

    return YelpListOfBusinessDetailsSchema.parse(response.data);
  }
);

const fetchDeliveryOptions = defineTool(
  {
    name: "fetchDeliveryOptions",
    description:
      "Use this tool to determine which businesses deliver food to you",
    inputSchema: z.object({
      location: z
        .string()
        .describe(
          `Your location. This string indicates the geographic area to be used when searching for businesses. Examples: "New York City", "NYC", "350 5th Ave, New York, NY 10118". Businesses returned in the response may not be strictly within the specified location.`
        ),
      categories: z
        .array(
          z
            .string()
            .describe(
              "Category alias to filter the businesses by such as cuisine type"
            )
        )
        .describe(
          "List of categories to filter the businesses by such as cuisine type"
        )
        .optional(),
    }),
    outputSchema: z
      .array(
        YelpBusinessDetailsSchema.describe(
          "JSON object representing a businesses that can deliver food to you"
        )
      )
      .describe(
        'List of JSON objects representing businesses that can deliver food to you"'
      )
      .nullable(),
  },
  async ({ location, categories }) => {
    const response = await sdk.v3_transaction_search({
      categories: categories,
      transaction_type: "delivery",
      location: location,
    });

    const data = response.data as any;

    return data.businesses.map((business: any) =>
      YelpBusinessDetailsSchema.parse(business)
    );
  }
);

export const fetchRestaurants = defineTool(
  {
    name: "fetchRestaurants",
    description: "Use this tool to determine menu items for a restaurant.",
    inputSchema: z.object({
      name: z.string().describe("The name of the restaurant"),
      location: z.string().describe("The location of the restaurant"),
    }),
    outputSchema: z
      .string()
      .describe(
        "Text contents from the restaurant's menu on their website. The menu items can be extracted from text."
      ),
  },
  async ({ name, location }) => {
    const searchResponse = await sdk.v3_business_search({
      sort_by: "best_match",
      limit: 1,
      location: location,
      term: name,
    });

    console.log(searchResponse.data);
    const searchResponseData = searchResponse.data as any;
    console.log(searchResponseData.businesses[0]);
    const id = searchResponseData.businesses[0].id;

    const detailsResponse = await sdk.v3_business_info({
      business_id_or_alias: id,
    });
    console.log(detailsResponse.data);
    const detailsResponseData = detailsResponse.data as any;
    return detailsResponseData.attributes?.menu_url;
  }
);

export const fetchRestaurantDetails = defineTool(
  {
    name: "fetchRestaurantDetails",
    description: "Use this tool to determine menu items for a restaurant.",
    inputSchema: z.object({
      name: z.string().describe("The name of the restaurant"),
      location: z.string().describe("The location of the restaurant"),
    }),
    outputSchema: z
      .string()
      .optional()
      .describe("A URL to the restaurant's menu on their website"),
  },
  async ({ name, location }) => {
    sdk.auth(
      "BEARER 7TXP3yxzCBUPiK7B8IdaVtYEGShVYrzbYiyJYkt7k0jlmVHpfnjSe2aSavmdQ-UpufoUAS4SSVV3ot5xsIdG6Z9dJ82ieA5tT0URS7-dYZD-gh92DJynE_ZnNj5XZnYx"
    );
    const searchResponse = await sdk.v3_business_search({
      sort_by: "best_match",
      limit: 1,
      location: location,
      term: name,
    });

    console.log(searchResponse.data);
    const searchResponseData = searchResponse.data as any;
    console.log(searchResponseData.businesses[0]);
    const id = searchResponseData.businesses[0].id;

    const detailsResponse = await sdk.v3_business_info({
      business_id_or_alias: id,
    });
    console.log(detailsResponse.data);
    const detailsResponseData = detailsResponse.data as any;
    return detailsResponseData.attributes?.menu_url;
  }
);
