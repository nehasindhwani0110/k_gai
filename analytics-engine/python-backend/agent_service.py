"""
Agent-based Query Generation Service (Python)
 
This service integrates LangChain SQL agents for improved SQL query generation.
Based on: https://github.com/Farzad-R/Advanced-QA-and-RAG-Series/tree/main/AgentGraph-Intelligent-Q%26A-and-RAG-System
"""

import os
import json
from typing import Dict, List, Optional
from sqlalchemy import create_engine, inspect, text
from langchain.agents import create_sql_agent
from langchain.agents.agent_toolkits import create_sql_agent_executor, SQLDatabaseToolkit
from langchain_openai import ChatOpenAI
from langchain_community.utilities import SQLDatabase
from langchain_core.prompts import ChatPromptTemplate


class SQLAgentService:
    """SQL Agent Service using LangChain"""
    
    def __init__(self):
        """Initialize the SQL Agent Service"""
        self.llm = ChatOpenAI(
            model=os.getenv("OPENAI_MODEL", "gpt-4-turbo-preview"),
            temperature=0,
            openai_api_key=os.getenv("OPENAI_API_KEY"),
        )
    
    def create_database_connection(self, connection_string: str) -> SQLDatabase:
        """
        Create a SQLDatabase connection for LangChain
        
        Args:
            connection_string: Database connection string
            
        Returns:
            SQLDatabase instance
        """
        # Normalize connection string
        normalized_connection_string = self._normalize_connection_string(connection_string)
        
        # Create SQLDatabase instance
        db = SQLDatabase.from_uri(normalized_connection_string)
        return db
    
    def _normalize_connection_string(self, connection_string: str) -> str:
        """
        Normalize connection string to handle special characters
        
        Args:
            connection_string: Raw connection string
            
        Returns:
            Normalized connection string
        """
        # Handle URL encoding if needed
        # This is a simplified version - adjust based on your needs
        return connection_string
    
    def generate_query(
        self,
        user_question: str,
        connection_string: str,
        metadata: Optional[Dict] = None
    ) -> Dict:
        """
        Generate SQL query using LangChain SQL Agent
        
        Args:
            user_question: User's natural language question
            connection_string: Database connection string
            metadata: Optional metadata about the database schema
            
        Returns:
            Dictionary with query and insight_summary
        """
        try:
            # Create database connection
            db = self.create_database_connection(connection_string)
            
            # Create SQL toolkit
            toolkit = SQLDatabaseToolkit(db=db, llm=self.llm)
            
            # Create SQL agent executor
            agent_executor = create_sql_agent_executor(
                llm=self.llm,
                toolkit=toolkit,
                verbose=os.getenv("DEBUG", "false").lower() == "true",
            )
            
            # Execute agent
            result = agent_executor.invoke({
                "input": user_question
            })
            
            # Extract query from result
            query = result.get("output", "")
            
            # Generate insight summary
            insight_prompt = ChatPromptTemplate.from_messages([
                ("system", "You are a data analyst. Explain what this SQL query does and what insights it provides."),
                ("user", f"Query: {query}\n\nQuestion: {user_question}\n\nProvide a brief explanation (max 50 words).")
            ])
            
            insight_chain = insight_prompt | self.llm
            insight_response = insight_chain.invoke({})
            insight_summary = insight_response.content if hasattr(insight_response, 'content') else str(insight_response)
            
            return {
                "query": query,
                "insight_summary": insight_summary,
                "success": True
            }
            
        except Exception as e:
            return {
                "error": str(e),
                "success": False
            }
    
    def explore_schema(
        self,
        user_question: str,
        connection_string: str
    ) -> Dict:
        """
        Explore database schema to find relevant tables for a question
        
        Args:
            user_question: User's question
            connection_string: Database connection string
            
        Returns:
            Dictionary with relevant schema metadata
        """
        try:
            # Create database connection
            db = self.create_database_connection(connection_string)
            
            # Get all table names
            all_tables = db.get_usable_table_names()
            
            # Use LLM to identify relevant tables
            table_selection_prompt = f"""Given this question: "{user_question}"

Available tables: {', '.join(all_tables)}

Which tables are likely needed to answer this question? Return a JSON object with a "tables" array.
Example: {{"tables": ["students", "grades"]}}"""
            
            table_response = self.llm.invoke(table_selection_prompt)
            table_content = table_response.content if hasattr(table_response, 'content') else str(table_response)
            
            # Parse table names
            try:
                # Try to extract JSON from response
                import re
                json_match = re.search(r'\{[^}]+\}', table_content)
                if json_match:
                    table_data = json.loads(json_match.group())
                    relevant_tables = table_data.get("tables", all_tables[:5])
                else:
                    relevant_tables = all_tables[:5]  # Default to first 5
            except:
                relevant_tables = all_tables[:5]
            
            # Get schema for relevant tables only
            tables_metadata = []
            for table_name in relevant_tables:
                if table_name in all_tables:
                    table_info = db.get_table_info_no_throw([table_name])
                    tables_metadata.append({
                        "name": table_name,
                        "info": table_info
                    })
            
            return {
                "source_type": "SQL_DB",
                "tables": tables_metadata,
                "success": True
            }
            
        except Exception as e:
            return {
                "error": str(e),
                "success": False
            }


# Global instance
_agent_service = None

def get_agent_service() -> SQLAgentService:
    """Get or create agent service instance"""
    global _agent_service
    if _agent_service is None:
        _agent_service = SQLAgentService()
    return _agent_service

