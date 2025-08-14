"""Controller for category-related endpoints."""

from flask import jsonify
from typing import List, Dict, Any


def get_all_categories():
    """
    Get hierarchical structure of all position categories and subcategories.
    
    Implements the getAllCategories operation from the OpenAPI spec.
    
    Returns:
        Response: JSON response with list of categories and HTTP status code
    """
    try:
        # Mock data for now - replace with actual database queries
        categories = [
            {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "parentId": None,
                "label": "Politics"
            },
            {
                "id": "550e8400-e29b-41d4-a716-446655440001", 
                "parentId": "550e8400-e29b-41d4-a716-446655440000",
                "label": "Federal Policy"
            },
            {
                "id": "550e8400-e29b-41d4-a716-446655440002",
                "parentId": None,
                "label": "Social Issues"
            },
            {
                "id": "550e8400-e29b-41d4-a716-446655440003",
                "parentId": "550e8400-e29b-41d4-a716-446655440002", 
                "label": "Healthcare"
            }
        ]
        
        return jsonify(categories), 200
        
    except Exception as e:
        error_response = {
            "code": 500,
            "message": "Internal server error",
            "details": {"error": str(e)}
        }
        return jsonify(error_response), 500
